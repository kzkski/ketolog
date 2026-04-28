import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import brandHeaderImage from "../assets/brand-header.png";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { pfcGramsFromNullablePer100, sumPfc, type PfcGrams } from "@ketolog/domain/pfc";
import { getMealTypeForTimeZone } from "@ketolog/domain/meal-timezone";
import type { MealType } from "@ketolog/types";
import {
  addDaysJst,
  formatNavDate,
  toJstDateString,
} from "@ketolog/domain/date";
import {
  type DietPhase,
  type PhaseProfiles,
  activePhaseProfile,
  normalizeUserSettings,
} from "@ketolog/domain/diet-phase";
import { useAuthSessionContext } from "../contexts/AuthSessionContext";
import { getSupabase } from "../lib/supabase";
import {
  FoodLogEntryModal,
  type FoodLogRow,
} from "../components/FoodLogEntryModal";
import {
  MenuItemEditorModal,
  type MenuItemEditorState,
} from "../components/MenuItemEditorModal";
import type { StandardFoodSearchRow } from "../lib/search-standard-foods-mobile";
import { AddRestaurantModal } from "../components/AddRestaurantModal";
import { TodaySettingsModal } from "../components/TodaySettingsModal";
import {
  TodayCartDock,
  type CartLineState,
} from "../components/TodayCartDock";
import { TodayMenuPanel } from "../components/TodayMenuPanel";
import type { MenuPrefill } from "../lib/menu-prefill";
import {
  enqueueFoodLogDraft,
  loadFoodLogOutbox,
  newClientRowId,
  removeFoodLogDraft,
  sendFoodLogDraft,
  type FoodLogOutboxDraft,
} from "../lib/food-log-outbox";
import type { FavoriteMenuItemPayload } from "../lib/fetch-favorite-groups-payload";
import { getIsOnline, isTransientNetworkError } from "../lib/network";
import { getOrCreateSnapshotRestaurant } from "../lib/get-or-create-snapshot-restaurant";

type UserSettingsState = {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
};

const DIET_PHASES: DietPhase[] = [1, 2, 3];

const MEAL_SHORT: Record<string, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夕",
  snack: "間",
};

/** Web `MEAL_LABELS` と同順・同表記（記録パネルの見出し用） */
const MEAL_LOG_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL_FULL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

const COLORS = {
  bg: "#0a0a0a",
  headerBorder: "#1f2937",
  sectionBg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  p: "#3b82f6",
  f: "#eab308",
  c: "#10b981",
  over: "#ef4444",
  phaseOnBorder: "#10b981",
  phaseOnBg: "rgba(6, 78, 59, 0.5)",
  phaseOnText: "#d1fae5",
  phaseOffBorder: "#374151",
  phaseOffBg: "rgba(31, 41, 55, 0.6)",
  phaseOffText: "#9ca3af",
};

function fmtMacroGrams(n: number) {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

function PfcBarRow({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const over = current > target;
  const widthPct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <View style={styles.pfcRow}>
      <Text style={styles.pfcLabel}>{label}</Text>
      <View style={styles.pfcBarTrack}>
        <View
          style={[
            styles.pfcBarFill,
            {
              width: `${widthPct}%`,
              backgroundColor: over ? COLORS.over : color,
            },
          ]}
        />
      </View>
      <Text
        style={[styles.pfcValue, over && { color: "#fca5a5" }]}
        numberOfLines={1}
      >{`${fmtMacroGrams(current)} / ${target}g`}</Text>
    </View>
  );
}

export function TodayScreen() {
  const { session, signOut } = useAuthSessionContext();
  const userId = session?.user.id ?? "";
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettingsState | null>(null);
  const [consumed, setConsumed] = useState<PfcGrams>({ p: 0, f: 0, c: 0 });
  const [selectedDate, setSelectedDate] = useState(() => toJstDateString());
  const [snapshotRestaurantId, setSnapshotRestaurantId] = useState<
    string | null
  >(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phaseSaving, setPhaseSaving] = useState(false);
  const [logEntries, setLogEntries] = useState<FoodLogRow[]>([]);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState<"add" | "edit">("add");
  const [editingEntry, setEditingEntry] = useState<FoodLogRow | null>(null);
  const [menuPrefill, setMenuPrefill] = useState<MenuPrefill | null>(null);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [menuEditorState, setMenuEditorState] = useState<MenuItemEditorState | null>(null);
  const [menuBrowseTabRequest, setMenuBrowseTabRequest] = useState<"composition" | null>(null);
  const [restaurantAddOpen, setRestaurantAddOpen] = useState(false);
  const [selectRestaurantIdAfterAdd, setSelectRestaurantIdAfterAdd] = useState<string | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<FoodLogOutboxDraft[]>([]);
  const [resendingDraftId, setResendingDraftId] = useState<string | null>(null);
  const [loadingDate, setLoadingDate] = useState(false);
  const [dataNonce, setDataNonce] = useState(0);
  const [showLogEntries, setShowLogEntries] = useState(false);
  const [cart, setCart] = useState<Map<string, CartLineState>>(() => new Map());
  const [cartExpanded, setCartExpanded] = useState(false);
  const [cartMealType, setCartMealType] = useState<MealType>(() =>
    getMealTypeForTimeZone(new Date(), "Asia/Tokyo")
  );
  const [cartSaving, setCartSaving] = useState(false);
  const initialLoadDoneForUser = useRef(false);
  const prevUserIdForDate = useRef<string | null>(null);

  const appVersion = Constants.expoConfig?.version ?? "—";
  const todayJst = toJstDateString();

  const refreshOutbox = useCallback(async () => {
    if (!userId) return;
    setOutbox(await loadFoodLogOutbox(userId));
  }, [userId]);

  useEffect(() => {
    setCart(new Map());
    setCartExpanded(false);
  }, [selectedDate, userId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);

    const [settingsRes, logRes, snapRes] = await Promise.all([
      supabase
        .from("user_settings")
        .select("diet_phase, phase_profiles")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("food_log")
        .select(
          "id, date, meal_type, item_name, grams, protein_g, fat_g, carbs_g"
        )
        .eq("user_id", userId)
        .eq("date", selectedDate)
        .order("created_at", { ascending: true }),
      getOrCreateSnapshotRestaurant(supabase, userId),
    ]);

    if (settingsRes.error) {
      setLoadError(settingsRes.error.message);
      return;
    }
    if (logRes.error) {
      setLoadError(logRes.error.message);
      return;
    }
    if (snapRes.error) {
      setSnapshotError(snapRes.error);
      setSnapshotRestaurantId(null);
    } else {
      setSnapshotError(null);
      setSnapshotRestaurantId(snapRes.data?.id ?? null);
    }

    setSettings(normalizeUserSettings(settingsRes.data));
    const rows = logRes.data ?? [];
    setLogEntries(
      rows.map((r) => ({
        id: String(r.id),
        date: String(r.date),
        meal_type: String(r.meal_type),
        item_name: String(r.item_name),
        grams: Number(r.grams) || 0,
        protein_g: Number(r.protein_g) || 0,
        fat_g: Number(r.fat_g) || 0,
        carbs_g: Number(r.carbs_g) || 0,
      }))
    );
    setConsumed(
      sumPfc(
        ...rows.map((r) => ({
          p: Number(r.protein_g) || 0,
          f: Number(r.fat_g) || 0,
          c: Number(r.carbs_g) || 0,
        }))
      )
    );
  }, [supabase, userId, selectedDate]);

  const cartLinesSorted = useMemo(
    () => [...cart.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [cart]
  );

  const cartPfcTotal = useMemo(() => {
    return sumPfc(
      ...cartLinesSorted.map((line) =>
        pfcGramsFromNullablePer100(
          line.protein_per_100g,
          line.fat_per_100g,
          line.carbs_per_100g,
          line.gramsPerServing * line.count
        )
      )
    );
  }, [cartLinesSorted]);

  /** バー表示は「本日の記録」＋「カート内」を合算（カート投入で即反映） */
  const pfcBarCurrent = useMemo(() => sumPfc(consumed, cartPfcTotal), [consumed, cartPfcTotal]);

  const mergeCartLine = useCallback(
    (line: CartLineState) => {
      setCart((prev) => {
        const next = new Map(prev);
        const cur = next.get(line.menuItemId);
        if (cur) {
          next.set(line.menuItemId, { ...cur, count: cur.count + 1 });
        } else {
          next.set(line.menuItemId, line);
        }
        return next;
      });
    },
    []
  );

  const addToCartFromItem = useCallback(
    (item: FavoriteMenuItemPayload, gramsPerServing: number) => {
      const g =
        Number.isFinite(gramsPerServing) && gramsPerServing > 0 ? gramsPerServing : 100;
      mergeCartLine({
        menuItemId: item.id,
        restaurantId: item.restaurant_id,
        name: item.name,
        gramsPerServing: g,
        count: 1,
        protein_per_100g:
          item.protein_per_100g != null ? Number(item.protein_per_100g) : null,
        fat_per_100g: item.fat_per_100g != null ? Number(item.fat_per_100g) : null,
        carbs_per_100g: item.carbs_per_100g != null ? Number(item.carbs_per_100g) : null,
      });
    },
    [mergeCartLine]
  );

  const openMenuEditorAdd = useCallback((registerRestaurantIdHint?: string | null) => {
    setMenuEditorState({
      kind: "add",
      registerRestaurantIdHint: registerRestaurantIdHint ?? null,
    });
    setMenuEditorOpen(true);
  }, []);

  const openMenuEditorFromStandardFood = useCallback(
    (row: StandardFoodSearchRow, registerRestaurantIdHint: string | null) => {
      setMenuEditorState({
        kind: "add",
        registerRestaurantIdHint,
        standardFoodDraft: {
          food_code: row.food_code,
          name: row.name,
          protein_per_100g:
            row.protein_per_100g != null && Number.isFinite(Number(row.protein_per_100g))
              ? Number(row.protein_per_100g)
              : null,
          fat_per_100g:
            row.fat_per_100g != null && Number.isFinite(Number(row.fat_per_100g))
              ? Number(row.fat_per_100g)
              : null,
          carbs_per_100g:
            row.carbs_per_100g != null && Number.isFinite(Number(row.carbs_per_100g))
              ? Number(row.carbs_per_100g)
              : null,
        },
      });
      setMenuEditorOpen(true);
    },
    []
  );

  const onBrowseTabRequestConsumed = useCallback(() => {
    setMenuBrowseTabRequest(null);
  }, []);

  const openMenuEditorEdit = useCallback((item: FavoriteMenuItemPayload) => {
    setMenuEditorState({ kind: "edit", menuItemId: item.id });
    setMenuEditorOpen(true);
  }, []);

  const handleMenuEditorSaved = useCallback(async () => {
    await load();
    setDataNonce((n) => n + 1);
  }, [load]);

  const onSelectRestaurantIdAfterAddConsumed = useCallback(() => {
    setSelectRestaurantIdAfterAdd(null);
  }, []);

  const onRestaurantCreated = useCallback((r: { id: string }) => {
    setSelectRestaurantIdAfterAdd(r.id);
    setDataNonce((n) => n + 1);
  }, []);

  const removeCartLine = useCallback((menuItemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(menuItemId);
      return next;
    });
  }, []);

  const clearCartAll = useCallback(() => {
    setCart(new Map());
    setCartExpanded(false);
  }, []);

  const updateCartGramsPerServing = useCallback((menuItemId: string, grams: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      const cur = next.get(menuItemId);
      if (!cur) return prev;
      next.set(menuItemId, { ...cur, gramsPerServing: grams });
      return next;
    });
  }, []);

  const clearCartForRestaurant = useCallback((restaurantId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      for (const [k, line] of next) {
        if (line.restaurantId === restaurantId) next.delete(k);
      }
      return next;
    });
  }, []);

  // 接続時は挿入成功後 load()。オフライン/一時失敗は food-log-outbox。docs/architecture/food-log-sync.md 参照。
  const saveCartToLog = useCallback(async () => {
    if (!userId || cart.size === 0) return;
    setCartSaving(true);
    const lines = [...cart.values()];
    const mkRow = (line: CartLineState) => {
      const totalGrams = line.gramsPerServing * line.count;
      const v = pfcGramsFromNullablePer100(
        line.protein_per_100g,
        line.fat_per_100g,
        line.carbs_per_100g,
        totalGrams
      );
      return {
        user_id: userId,
        date: selectedDate,
        meal_type: cartMealType,
        item_name: line.name,
        grams: totalGrams,
        protein_g: v.p,
        fat_g: v.f,
        carbs_g: v.c,
        source: line.restaurantId,
        menu_item_id: line.snapshotDraft ? null : line.menuItemId,
      };
    };

    const enqueueAll = async () => {
      const now = new Date().toISOString();
      for (const line of lines) {
        const totalGrams = line.gramsPerServing * line.count;
        const v = pfcGramsFromNullablePer100(
          line.protein_per_100g,
          line.fat_per_100g,
          line.carbs_per_100g,
          totalGrams
        );
        await enqueueFoodLogDraft(userId, {
          id: newClientRowId(),
          date: selectedDate,
          meal_type: cartMealType,
          item_name: line.name,
          grams: totalGrams,
          protein_g: v.p,
          fat_g: v.f,
          carbs_g: v.c,
          source: line.restaurantId,
          menu_item_id: line.snapshotDraft ? null : line.menuItemId,
          saved_at: now,
        });
      }
    };

    const online = await getIsOnline();
    if (!online) {
      await enqueueAll();
      setCart(new Map());
      setCartExpanded(false);
      await refreshOutbox();
      await load();
      showToast("オフラインのため端末に下書きを保存しました。通信が戻ったら再送してください。");
      setCartSaving(false);
      return;
    }

    const { error } = await supabase.from("food_log").insert(lines.map(mkRow));
    if (error) {
      if (isTransientNetworkError(error)) {
        await enqueueAll();
        setCart(new Map());
        setCartExpanded(false);
        await refreshOutbox();
        await load();
        showToast("通信に失敗しました。端末に下書きを残しました。");
        setCartSaving(false);
        return;
      }
      showToast(`記録に失敗しました: ${error.message}`);
      setCartSaving(false);
      return;
    }

    setCart(new Map());
    setCartExpanded(false);
    await load();
    await refreshOutbox();
    const totalItems = lines.reduce((s, l) => s + l.count, 0);
    showToast(`${totalItems} 品目を記録しました`);
    setCartSaving(false);
  }, [
    userId,
    cart,
    selectedDate,
    cartMealType,
    supabase,
    refreshOutbox,
    load,
    showToast,
  ]);

  /** Web 今日ビューの「＋」と同じく、メニュー追加ドロワー（`MenuItemEditorModal`）を開く */
  const openAddEntry = useCallback(() => {
    setMenuEditorState({ kind: "add", registerRestaurantIdHint: null });
    setMenuEditorOpen(true);
  }, []);

  const goPrevDate = useCallback(() => {
    setSelectedDate((d) => addDaysJst(d, -1));
  }, []);

  const goNextDate = useCallback(() => {
    setSelectedDate((d) => {
      const n = addDaysJst(d, 1);
      if (n > toJstDateString()) return d;
      return n;
    });
  }, []);

  const goToday = useCallback(() => {
    setSelectedDate(toJstDateString());
  }, []);

  const openEditEntry = useCallback((e: FoodLogRow) => {
    setMenuPrefill(null);
    setEditingEntry(e);
    setEntryModalMode("edit");
    setEntryModalOpen(true);
  }, []);

  const confirmDeleteEntry = useCallback(
    (e: FoodLogRow) => {
      Alert.alert(
        "記録を削除",
        `「${e.item_name}」を削除しますか？`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: () => {
              void (async () => {
                const { error } = await supabase
                  .from("food_log")
                  .delete()
                  .eq("id", e.id)
                  .eq("user_id", userId);
                if (error) {
                  showToast(`削除に失敗: ${error.message}`);
                  return;
                }
                showToast("削除しました");
                await load();
              })();
            },
          },
        ],
        { cancelable: true }
      );
    },
    [supabase, userId, load, showToast]
  );

  useEffect(() => {
    initialLoadDoneForUser.current = false;
    if (userId && prevUserIdForDate.current !== userId) {
      queueMicrotask(() => {
        setSelectedDate(toJstDateString());
      });
    }
    prevUserIdForDate.current = userId || null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const isFirstForUser = !initialLoadDoneForUser.current;
    (async () => {
      if (isFirstForUser) setLoading(true);
      else setLoadingDate(true);
      await Promise.all([load(), refreshOutbox()]);
      if (cancelled) return;
      if (isFirstForUser) {
        setLoading(false);
        initialLoadDoneForUser.current = true;
      } else {
        setLoadingDate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshOutbox, userId, selectedDate]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([load(), refreshOutbox()]);
    setDataNonce((n) => n + 1);
    setRefreshing(false);
  }, [load, refreshOutbox, userId]);

  const resendDraft = useCallback(
    async (d: FoodLogOutboxDraft) => {
      if (!userId) return;
      if (!(await getIsOnline())) {
        showToast("オフラインです。通信が戻ってから再送してください。");
        return;
      }
      setResendingDraftId(d.id);
      const r = await sendFoodLogDraft(supabase, userId, d);
      setResendingDraftId(null);
      if (r.ok) {
        await removeFoodLogDraft(userId, d.id);
        await refreshOutbox();
        await load();
        showToast("サーバーに送りました");
        return;
      }
      showToast(r.error);
    },
    [supabase, userId, load, refreshOutbox, showToast]
  );

  const discardDraft = useCallback(
    (d: FoodLogOutboxDraft) => {
      Alert.alert(
        "下書きを破棄",
        `「${d.item_name}」の未送信下書きを端末から削除しますか？`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "破棄",
            style: "destructive",
            onPress: () => {
              void (async () => {
                await removeFoodLogDraft(userId, d.id);
                await refreshOutbox();
                showToast("下書きを破棄しました");
              })();
            },
          },
        ],
        { cancelable: true }
      );
    },
    [userId, refreshOutbox, showToast]
  );

  const onSelectPhase = useCallback(
    async (ph: DietPhase) => {
      if (!userId || !settings || ph === settings.diet_phase) return;
      setPhaseSaving(true);
      setLoadError(null);
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          diet_phase: ph,
          phase_profiles: settings.phase_profiles,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        setLoadError(error.message);
      } else {
        setSettings((s) => (s ? { ...s, diet_phase: ph } : s));
      }
      setPhaseSaving(false);
    },
    [settings, supabase, userId]
  );

  const activeProfile = settings
    ? activePhaseProfile(settings)
    : null;

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={COLORS.c} />
          <Text style={styles.loadingHint}>今日の記録を読み込んでいます…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!settings || !activeProfile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centeredFill}>
          <Text style={styles.errorTitle}>表示できません</Text>
          {loadError ? <Text style={styles.errorMsg}>{loadError}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      <View style={styles.root}>
        <View style={styles.topHeader}>
          <View style={styles.brandBlock}>
            <View style={styles.brandIconWrap} accessibilityLabel="Ketolog">
              <Image
                alt="Ketolog"
                source={brandHeaderImage}
                style={styles.brandIconImage}
                resizeMode="cover"
                accessibilityLabel="Ketolog"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View>
              <Text style={styles.brandName}>Ketolog</Text>
              <Text style={styles.brandSub}>v{appVersion}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityLabel="設定"
          >
            <Ionicons name="settings-outline" size={24} color={COLORS.textMuted} />
          </Pressable>
        </View>

        <View style={styles.dateNav}>
          <Pressable
            onPress={goPrevDate}
            disabled={loadingDate}
            style={({ pressed }) => [
              styles.dateNavBtn,
              (loadingDate || pressed) && { opacity: 0.65 },
            ]}
            accessibilityLabel="前の日"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>
          <View style={styles.dateNavCenter}>
            {loadingDate ? (
              <ActivityIndicator size="small" color={COLORS.c} />
            ) : (
              <Text style={styles.dateNavLabel} numberOfLines={1}>
                {formatNavDate(selectedDate, todayJst)}
              </Text>
            )}
          </View>
          {selectedDate !== todayJst ? (
            <Pressable
              onPress={goToday}
              disabled={loadingDate}
              style={({ pressed }) => [
                styles.todayChip,
                (loadingDate || pressed) && { opacity: 0.75 },
              ]}
              accessibilityLabel="今日に戻る"
              accessibilityRole="button"
            >
              <Text style={styles.todayChipText}>今日</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={goNextDate}
            disabled={selectedDate >= todayJst || loadingDate}
            style={({ pressed }) => [
              styles.dateNavBtn,
              (selectedDate >= todayJst || loadingDate || pressed) && {
                opacity: 0.35,
              },
            ]}
            accessibilityLabel="次の日"
          >
            <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
          </Pressable>
        </View>

        <View style={styles.bodyColumn}>
          {loadError ? <Text style={styles.inlineError}>{loadError}</Text> : null}
          {snapshotError && !snapshotRestaurantId ? (
            <Text style={styles.inlineWarn}>
              手入力用の店舗データを読み込めませんでした（{snapshotError}
              ）。メニューからの追加は利用できます。
            </Text>
          ) : null}

          <View style={styles.phaseRow}>
            {DIET_PHASES.map((ph) => {
              const pr = settings.phase_profiles[String(ph) as keyof PhaseProfiles];
              const on = settings.diet_phase === ph;
              return (
                <Pressable
                  key={ph}
                  onPress={() => {
                    void onSelectPhase(ph);
                  }}
                  disabled={phaseSaving}
                  style={({ pressed }) => [
                    styles.phaseBtn,
                    on ? styles.phaseBtnOn : styles.phaseBtnOff,
                    pressed && { opacity: 0.85 },
                    phaseSaving && { opacity: 0.5 },
                  ]}
                >
                  <Text
                    style={on ? styles.phaseBtnTextOn : styles.phaseBtnTextOff}
                    numberOfLines={1}
                  >
                    {pr.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={styles.pfcBlock}
            accessibilityLabel={
              cartLinesSorted.length > 0
                ? "PFC（記録済みとカート内の合計）"
                : "PFC（記録済み）"
            }
          >
            <PfcBarRow
              label="P"
              current={pfcBarCurrent.p}
              target={activeProfile.protein_target_g}
              color={COLORS.p}
            />
            <PfcBarRow
              label="F"
              current={pfcBarCurrent.f}
              target={activeProfile.fat_target_g}
              color={COLORS.f}
            />
            <PfcBarRow
              label="C"
              current={pfcBarCurrent.c}
              target={activeProfile.carbs_target_g}
              color={COLORS.c}
            />
          </View>

          <View style={[styles.logOuter, !showLogEntries && styles.logOuterCollapsed]}>
            {outbox.length > 0 ? (
              <View style={styles.outboxWrap}>
              <View style={styles.outboxBlock}>
                <Text style={styles.outboxTitle}>未送信の下書き</Text>
                <Text style={styles.outboxHint}>
                  クラウドへはまだ届いていません。通信が安定したら「再送」を押してください。
                </Text>
                {outbox.map((d) => (
                  <View key={d.id} style={styles.outboxRow}>
                    <View style={styles.outboxRowBody}>
                      <Text style={styles.outboxDate}>
                        {d.date} · {MEAL_SHORT[d.meal_type] ?? d.meal_type}
                      </Text>
                      <Text style={styles.outboxItem} numberOfLines={2}>
                        {d.item_name}
                      </Text>
                      <Text style={styles.outboxMeta}>
                        {d.grams}g · P {fmtMacroGrams(d.protein_g)} / F{" "}
                        {fmtMacroGrams(d.fat_g)} / C {fmtMacroGrams(d.carbs_g)}
                      </Text>
                    </View>
                    <View style={styles.outboxActions}>
                      <Pressable
                        onPress={() => {
                          void resendDraft(d);
                        }}
                        disabled={resendingDraftId !== null}
                        style={({ pressed }) => [
                          styles.outboxResendBtn,
                          pressed && { opacity: 0.85 },
                          resendingDraftId !== null && { opacity: 0.5 },
                        ]}
                        accessibilityLabel="再送"
                      >
                        {resendingDraftId === d.id ? (
                          <ActivityIndicator size="small" color="#022c22" />
                        ) : (
                          <Text style={styles.outboxResendText}>再送</Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => discardDraft(d)}
                        disabled={resendingDraftId !== null}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.outboxDiscardBtn,
                          pressed && { opacity: 0.75 },
                          resendingDraftId !== null && { opacity: 0.4 },
                        ]}
                        accessibilityLabel="下書きを破棄"
                      >
                        <Text style={styles.outboxDiscardText}>破棄</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
              </View>
            ) : null}

            <View style={styles.logPanel}>
              <View
                style={[
                  styles.logPanelHeader,
                  showLogEntries && styles.logPanelHeaderExpanded,
                  !showLogEntries && styles.logPanelHeaderCollapsed,
                ]}
              >
                <Pressable
                  onPress={() => setShowLogEntries((v) => !v)}
                  style={({ pressed }) => [
                    styles.logExpandTap,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel={showLogEntries ? "記録一覧を閉じる" : "記録一覧を開く"}
                >
                  <View style={styles.logTitleRow}>
                    <Text style={styles.logPanelTitle}>
                      {selectedDate === todayJst ? "今日の記録" : "この日の記録"}
                    </Text>
                    <Text style={styles.logPanelCount}>
                      （{logEntries.length}件）
                    </Text>
                  </View>
                  <Ionicons
                    name={showLogEntries ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#6b7280"
                  />
                </Pressable>
                <Pressable
                  onPress={openAddEntry}
                  style={({ pressed }) => [
                    styles.logAddOutline,
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityLabel="メニュー追加・今すぐ記録・カート（店舗タブのメニュー追加と同じ）"
                >
                  <Ionicons name="create-outline" size={17} color="#d1d5db" />
                  <Text style={styles.logAddOutlineText}>手入力</Text>
                </Pressable>
              </View>
              {showLogEntries ? (
                logEntries.length === 0 ? (
                  <Text style={styles.logEmptyOnDark}>
                    メニューまたはお気に入りの「＋」でカートに入れ、画面下のカートからまとめて記録するのがいちばん早いです。手入力で足すときは「手入力」から。
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.logListScroll}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {MEAL_LOG_ORDER.map((mt) => {
                      const items = logEntries.filter((e) => e.meal_type === mt);
                      if (items.length === 0) return null;
                      return (
                        <View key={mt}>
                          <Text style={styles.logMealSectionLabel}>
                            {MEAL_LABEL_FULL[mt]}
                          </Text>
                          {items.map((e) => (
                            <View key={e.id} style={styles.logEntryRow}>
                              <Text style={styles.logEntryName} numberOfLines={1}>
                                {e.item_name}
                              </Text>
                              <Text style={styles.logEntryGrams}>{e.grams}g</Text>
                              <Text style={styles.logEntryPfc} numberOfLines={1}>
                                {`P${fmtMacroGrams(e.protein_g)} F${fmtMacroGrams(e.fat_g)} C${fmtMacroGrams(e.carbs_g)}`}
                              </Text>
                              <Pressable
                                onPress={() => openEditEntry(e)}
                                hitSlop={8}
                                style={({ pressed }) => [
                                  styles.logEntryIconBtn,
                                  pressed && { opacity: 0.75 },
                                ]}
                                accessibilityLabel="編集"
                              >
                                <Text style={styles.logEntryEditGlyph}>✎</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => confirmDeleteEntry(e)}
                                hitSlop={8}
                                style={({ pressed }) => [
                                  styles.logEntryIconBtn,
                                  pressed && { opacity: 0.75 },
                                ]}
                                accessibilityLabel="削除"
                              >
                                <Text style={styles.logEntryDeleteGlyph}>✕</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </ScrollView>
                )
              ) : null}
            </View>
          </View>

          <View style={styles.menuPanelSlot}>
            <TodayMenuPanel
              supabase={supabase}
              userId={userId}
              reloadNonce={dataNonce}
              onAddToCart={addToCartFromItem}
              onEditMenuItem={openMenuEditorEdit}
              onOpenRestaurantAdd={() => setRestaurantAddOpen(true)}
              onOpenMenuEditorAdd={openMenuEditorAdd}
              selectRestaurantIdAfterAdd={selectRestaurantIdAfterAdd}
              onSelectRestaurantIdAfterAddConsumed={onSelectRestaurantIdAfterAddConsumed}
              macroTargets={{
                protein_target_g: activeProfile.protein_target_g,
                fat_target_g: activeProfile.fat_target_g,
              }}
              browseTabRequest={menuBrowseTabRequest}
              onBrowseTabRequestConsumed={onBrowseTabRequestConsumed}
              onPickStandardFoodForMenu={openMenuEditorFromStandardFood}
              onToast={showToast}
              onRestaurantDeleted={clearCartForRestaurant}
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
              menuBottomInset={cartExpanded ? 180 : 108}
            />
          </View>

        <TodayCartDock
          lines={cartLinesSorted}
          expanded={cartExpanded}
          onToggleExpanded={() => setCartExpanded((v) => !v)}
          cartPfc={cartPfcTotal}
          mealType={cartMealType}
          onMealType={setCartMealType}
          saving={cartSaving}
          onSave={() => {
            void saveCartToLog();
          }}
          onClearAll={clearCartAll}
          onRemoveLine={removeCartLine}
          onUpdateGramsPerServing={updateCartGramsPerServing}
        />
        </View>
      </View>
      </KeyboardAvoidingView>

      <FoodLogEntryModal
        visible={entryModalOpen}
        mode={entryModalMode}
        supabase={supabase}
        userId={userId}
        date={selectedDate}
        snapshotRestaurantId={snapshotRestaurantId}
        entry={editingEntry}
        menuPrefill={entryModalMode === "add" ? menuPrefill : null}
        onClose={() => {
          setEntryModalOpen(false);
          setEditingEntry(null);
          setMenuPrefill(null);
        }}
        onSaved={load}
        onToast={showToast}
        onOutboxChanged={refreshOutbox}
      />

      <MenuItemEditorModal
        visible={menuEditorOpen}
        state={menuEditorState}
        supabase={supabase}
        userId={userId}
        date={selectedDate}
        mealTypeForLog={cartMealType}
        snapshotRestaurantId={snapshotRestaurantId}
        onClose={() => {
          setMenuEditorOpen(false);
          setMenuEditorState(null);
        }}
        onSaved={handleMenuEditorSaved}
        onToast={showToast}
        onOutboxChanged={refreshOutbox}
        onRequestOpenStandardFoodComposition={() => {
          setMenuEditorOpen(false);
          setMenuEditorState(null);
          setMenuBrowseTabRequest("composition");
        }}
      />

      <AddRestaurantModal
        visible={restaurantAddOpen}
        supabase={supabase}
        userId={userId}
        onClose={() => setRestaurantAddOpen(false)}
        onAdded={onRestaurantCreated}
        onToast={showToast}
      />

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <TodaySettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        supabase={supabase}
        userId={userId}
        settings={settings}
        onSettingsUpdated={(next) => {
          setSettings(next);
          setDataNonce((n) => n + 1);
        }}
        onToast={showToast}
        onSignOut={() => {
          setSettingsOpen(false);
          void signOut();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  kavRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  bodyColumn: {
    flex: 1,
    minHeight: 0,
  },
  menuPanelSlot: {
    flex: 1,
    minHeight: 0,
  },
  centeredFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingHint: {
    marginTop: 12,
    color: COLORS.textMuted,
    fontSize: 14,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
  },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
    backgroundColor: "#0f172a",
  },
  brandIconImage: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  brandSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
  },
  dateNavBtn: {
    minWidth: 44,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    minHeight: 40,
    minWidth: 0,
  },
  dateNavLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  todayChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.c,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    marginRight: 2,
  },
  todayChipText: {
    color: "#a7f3d0",
    fontSize: 13,
    fontWeight: "700",
  },
  iconBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
  },
  phaseBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  phaseBtnOn: {
    borderColor: COLORS.phaseOnBorder,
    backgroundColor: COLORS.phaseOnBg,
  },
  phaseBtnOff: {
    borderColor: COLORS.phaseOffBorder,
    backgroundColor: COLORS.phaseOffBg,
  },
  phaseBtnTextOn: { color: COLORS.phaseOnText, fontSize: 11, fontWeight: "600" },
  phaseBtnTextOff: { color: COLORS.phaseOffText, fontSize: 11, fontWeight: "500" },
  pfcBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
    gap: 6,
  },
  pfcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pfcLabel: {
    width: 12,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  pfcBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#1f2937",
    borderRadius: 3,
    overflow: "hidden",
  },
  pfcBarFill: { height: "100%", borderRadius: 3 },
  pfcValue: {
    width: 80,
    fontSize: 11,
    textAlign: "right",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  logOuter: {
    marginTop: 8,
    paddingBottom: 20,
  },
  logOuterCollapsed: {
    paddingBottom: 8,
  },
  outboxWrap: {
    marginHorizontal: 12,
    marginBottom: 10,
  },
  outboxBlock: {
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#854d0e",
    backgroundColor: "rgba(113, 63, 18, 0.35)",
  },
  outboxTitle: {
    color: "#fef3c7",
    fontSize: 14,
    fontWeight: "700",
  },
  outboxHint: {
    color: "#fde68a",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  outboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    marginBottom: 8,
  },
  outboxRowBody: { flex: 1, minWidth: 0 },
  outboxDate: { color: "#fcd34d", fontSize: 10, marginBottom: 2 },
  outboxItem: { color: "#fffbeb", fontSize: 14, fontWeight: "600" },
  outboxMeta: {
    color: "#fde68a",
    fontSize: 11,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  outboxActions: { alignItems: "flex-end", gap: 6 },
  outboxResendBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.c,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  outboxResendText: { color: "#022c22", fontWeight: "700", fontSize: 13 },
  outboxDiscardBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  outboxDiscardText: { color: "#fecaca", fontSize: 12, fontWeight: "600" },
  /** Web Today の記録済みパネル相当: bg-gray-950 + border-gray-800 */
  logPanel: {
    backgroundColor: "#030712",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#1f2937",
  },
  logPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logPanelHeaderExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(31, 41, 55, 0.9)",
  },
  logPanelHeaderCollapsed: {
    paddingBottom: 8,
  },
  logExpandTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 0,
  },
  logTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  logPanelTitle: {
    color: "#d1d5db",
    fontSize: 12,
    fontWeight: "600",
  },
  logPanelCount: {
    color: "#9ca3af",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  logAddOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "rgba(17, 24, 39, 0.6)",
  },
  logAddOutlineText: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
  },
  logEmptyOnDark: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 12,
  },
  logListScroll: {
    maxHeight: 240,
  },
  logMealSectionLabel: {
    paddingHorizontal: 14,
    paddingVertical: 1,
    fontSize: 11,
    lineHeight: 12,
    color: "#6b7280",
    backgroundColor: "rgba(17, 24, 39, 0.5)",
  },
  logEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(31, 41, 55, 0.4)",
  },
  logEntryName: {
    flex: 1,
    minWidth: 0,
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 15,
    fontWeight: "400",
  },
  logEntryGrams: {
    width: 44,
    fontSize: 11,
    lineHeight: 12,
    color: "#9ca3af",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  logEntryPfc: {
    width: 108,
    fontSize: 11,
    lineHeight: 12,
    color: "#6b7280",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  logEntryIconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  logEntryEditGlyph: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "500",
  },
  logEntryDeleteGlyph: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "500",
  },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#1f2937",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
  },
  toastText: { color: COLORS.text, fontSize: 13, textAlign: "center" },
  inlineError: {
    color: "#fecaca",
    fontSize: 12,
    marginHorizontal: 12,
    marginTop: 8,
  },
  inlineWarn: {
    color: "#fde68a",
    fontSize: 12,
    marginHorizontal: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  errorTitle: { color: "#fecaca", fontSize: 16, fontWeight: "600" },
  errorMsg: { color: COLORS.text, marginTop: 8, textAlign: "center" },
});
