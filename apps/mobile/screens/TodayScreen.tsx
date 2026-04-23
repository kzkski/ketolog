import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import brandHeaderImage from "../assets/brand-header.png";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { sumPfc, type PfcGrams } from "@ketolog/domain/pfc";
import { toJstDateString } from "@ketolog/domain/date";
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
import { MenuPickModal } from "../components/MenuPickModal";
import type { MenuPrefill } from "../lib/menu-prefill";
import {
  loadFoodLogOutbox,
  removeFoodLogDraft,
  sendFoodLogDraft,
  type FoodLogOutboxDraft,
} from "../lib/food-log-outbox";
import { getIsOnline } from "../lib/network";

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
  const [jstDate, setJstDate] = useState(() => toJstDateString());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phaseSaving, setPhaseSaving] = useState(false);
  const [logEntries, setLogEntries] = useState<FoodLogRow[]>([]);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState<"add" | "edit">("add");
  const [editingEntry, setEditingEntry] = useState<FoodLogRow | null>(null);
  const [menuPrefill, setMenuPrefill] = useState<MenuPrefill | null>(null);
  const [menuPickOpen, setMenuPickOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<FoodLogOutboxDraft[]>([]);
  const [resendingDraftId, setResendingDraftId] = useState<string | null>(null);

  const appVersion = Constants.expoConfig?.version ?? "—";

  const refreshOutbox = useCallback(async () => {
    if (!userId) return;
    setOutbox(await loadFoodLogOutbox(userId));
  }, [userId]);

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
    const today = toJstDateString();
    setJstDate(today);

    const [settingsRes, logRes] = await Promise.all([
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
        .eq("date", today)
        .order("created_at", { ascending: true }),
    ]);

    if (settingsRes.error) {
      setLoadError(settingsRes.error.message);
      return;
    }
    if (logRes.error) {
      setLoadError(logRes.error.message);
      return;
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
  }, [supabase, userId]);

  const openAddEntry = useCallback(() => {
    setMenuPrefill(null);
    setEditingEntry(null);
    setEntryModalMode("add");
    setEntryModalOpen(true);
  }, []);

  const openMenuPick = useCallback(() => {
    setMenuPickOpen(true);
  }, []);

  const onMenuPicked = useCallback((prefill: MenuPrefill) => {
    setMenuPrefill(prefill);
    setEditingEntry(null);
    setEntryModalMode("add");
    setMenuPickOpen(false);
    setEntryModalOpen(true);
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
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([load(), refreshOutbox()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshOutbox, userId]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([load(), refreshOutbox()]);
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
              <Text style={styles.brandSub}>v{appVersion} · 記録（JST {jstDate}）</Text>
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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loadError ? <Text style={styles.inlineError}>{loadError}</Text> : null}

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

          <View style={styles.pfcBlock}>
            <PfcBarRow
              label="P"
              current={consumed.p}
              target={activeProfile.protein_target_g}
              color={COLORS.p}
            />
            <PfcBarRow
              label="F"
              current={consumed.f}
              target={activeProfile.fat_target_g}
              color={COLORS.f}
            />
            <PfcBarRow
              label="C"
              current={consumed.c}
              target={activeProfile.carbs_target_g}
              color={COLORS.c}
            />
          </View>

          <View style={styles.logSection}>
            {outbox.length > 0 ? (
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
            ) : null}
            <View style={styles.logSectionHeader}>
              <Text style={styles.logSectionTitle}>今日の記録</Text>
              <View style={styles.logActions}>
                <Pressable
                  onPress={openMenuPick}
                  style={({ pressed }) => [
                    styles.menuChip,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel="登録メニューから追加"
                >
                  <Ionicons name="restaurant-outline" size={16} color="#e5e7eb" />
                  <Text style={styles.menuChipText}>メニュー</Text>
                </Pressable>
                <Pressable
                  onPress={openAddEntry}
                  style={({ pressed }) => [
                    styles.addChip,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel="食事を手入力で追加"
                >
                  <Ionicons name="add" size={18} color="#022c22" />
                  <Text style={styles.addChipText}>追加</Text>
                </Pressable>
              </View>
            </View>
            {logEntries.length === 0 ? (
              <Text style={styles.logEmpty}>
                まだ記録がありません。「メニュー」で Web
                に登録した店のメニューから、「追加」から手入力で登録できます（Web
                での記録もここに表示されます）。
              </Text>
            ) : (
              logEntries.map((e) => (
                <View key={e.id} style={styles.logRow}>
                  <Pressable
                    onPress={() => openEditEntry(e)}
                    style={({ pressed }) => [
                      styles.logRowMain,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.logMealBadge}>
                      {MEAL_SHORT[e.meal_type] ?? e.meal_type}
                    </Text>
                    <View style={styles.logRowBody}>
                      <Text style={styles.logItemName} numberOfLines={2}>
                        {e.item_name}
                      </Text>
                      <Text style={styles.logMeta}>
                        {e.grams}g · P {fmtMacroGrams(e.protein_g)} / F{" "}
                        {fmtMacroGrams(e.fat_g)} / C {fmtMacroGrams(e.carbs_g)}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteEntry(e)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.logDeleteBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityLabel="削除"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color="#f87171"
                    />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <MenuPickModal
        visible={menuPickOpen}
        supabase={supabase}
        userId={userId}
        onClose={() => setMenuPickOpen(false)}
        onPick={onMenuPicked}
      />

      <FoodLogEntryModal
        visible={entryModalOpen}
        mode={entryModalMode}
        supabase={supabase}
        userId={userId}
        date={jstDate}
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

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsOpen(false)}
            accessibilityLabel="閉じる"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>設定</Text>
            <Text style={styles.modalBody}>
              PFC 目標の編集・データのエクスポート・全データ管理は、Web 版の Ketolog を開いて行ってください。
            </Text>
            <Pressable
              onPress={() => {
                setSettingsOpen(false);
                void signOut();
              }}
              style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.dangerBtnText}>ログアウト</Text>
            </Pressable>
            <Pressable
              onPress={() => setSettingsOpen(false)}
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.outlineBtnText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  root: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 32,
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
  logSection: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingBottom: 72,
  },
  outboxBlock: {
    marginBottom: 14,
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
  logSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  logActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logSectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  menuChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1f2937",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
  },
  menuChipText: { color: COLORS.text, fontWeight: "600", fontSize: 13 },
  addChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.c,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addChipText: { color: "#022c22", fontWeight: "700", fontSize: 13 },
  logEmpty: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: COLORS.sectionBg,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
    overflow: "hidden",
  },
  logRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 8,
  },
  logMealBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#a7f3d0",
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  logRowBody: { flex: 1, minWidth: 0 },
  logItemName: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  logMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  logDeleteBtn: {
    justifyContent: "center",
    paddingHorizontal: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: COLORS.headerBorder,
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
  errorTitle: { color: "#fecaca", fontSize: 16, fontWeight: "600" },
  errorMsg: { color: COLORS.text, marginTop: 8, textAlign: "center" },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { color: COLORS.text, fontSize: 17, fontWeight: "600" },
  modalBody: { color: COLORS.textMuted, fontSize: 13, marginTop: 10, lineHeight: 20 },
  dangerBtn: {
    marginTop: 18,
    backgroundColor: "#7f1d1d",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerBtnText: { color: "#fecaca", fontWeight: "600" },
  outlineBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  outlineBtnText: { color: COLORS.text, fontWeight: "500" },
});
