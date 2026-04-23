import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pfcGramsFromNullablePer100 } from "@ketolog/domain/pfc";
import type { MealType } from "@ketolog/types";

import { fetchDistinctMenuGroupNames } from "../lib/fetch-distinct-menu-group-names";
import { fetchRestaurantsExcludingSnapshot } from "../lib/fetch-restaurants-excluding-snapshot";
import {
  buildFoodLogInsertPayload,
  enqueueFoodLogDraft,
  newClientRowId,
  type FoodLogOutboxDraft,
} from "../lib/food-log-outbox";
import { getIsOnline, isTransientNetworkError } from "../lib/network";
import { resolveMenuItemGroupOrder } from "../lib/resolve-menu-item-group-order";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

const RANK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "◎ 最優先" },
  { value: 2, label: "○ 通常" },
  { value: 3, label: "△ 控えめ" },
  { value: 4, label: "✕ 避ける" },
];

const MEMO_MIN_ROWS = 3;

type NutrientMode = "per100g" | "perServing";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  danger: "#ef4444",
};

function to100g(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (Number.isNaN(v) || Number.isNaN(g) || g === 0) return val;
  return String(parseFloat(((v * 100) / g).toFixed(2)));
}

function toServing(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (Number.isNaN(v) || Number.isNaN(g)) return val;
  return String(parseFloat(((v * g) / 100).toFixed(2)));
}

export type MenuItemEditorState =
  | { kind: "add"; registerRestaurantIdHint?: string | null }
  | { kind: "edit"; menuItemId: string };

type MenuRow = {
  id: string;
  restaurant_id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
  shared_barcode: string | null;
  standard_food_code: string | null;
};

type Props = {
  visible: boolean;
  state: MenuItemEditorState | null;
  supabase: SupabaseClient;
  userId: string;
  date: string;
  mealTypeForLog: MealType;
  snapshotRestaurantId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  onAddSnapshotDraftToCart: (draft: {
    name: string;
    protein_per_100g: number | null;
    fat_per_100g: number | null;
    carbs_per_100g: number | null;
    grams: number;
  }) => void;
  onOutboxChanged?: () => void | Promise<void>;
};

export function MenuItemEditorModal({
  visible,
  state,
  supabase,
  userId,
  date,
  mealTypeForLog,
  snapshotRestaurantId,
  onClose,
  onSaved,
  onToast,
  onAddSnapshotDraftToCart,
  onOutboxChanged,
}: Props) {
  const isEdit = state?.kind === "edit";

  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [grams, setGrams] = useState("100");
  const [rank, setRank] = useState(2);
  const [groupName, setGroupName] = useState("");
  const [notes, setNotes] = useState("");
  const [nutrientMode, setNutrientMode] = useState<NutrientMode>("perServing");
  const [rawP, setRawP] = useState<string | null>(null);
  const [rawF, setRawF] = useState<string | null>(null);
  const [rawC, setRawC] = useState<string | null>(null);

  const [logMeal, setLogMeal] = useState<MealType>("lunch");

  const [registerRestaurants, setRegisterRestaurants] = useState<{ id: string; name: string }[]>(
    []
  );
  const [registerRestaurantId, setRegisterRestaurantId] = useState<string | null>(null);
  const [registerRestaurantsLoading, setRegisterRestaurantsLoading] = useState(false);
  const [existingGroupNames, setExistingGroupNames] = useState<string[]>([]);
  const [groupSuggestOpen, setGroupSuggestOpen] = useState(false);

  const [loadedEdit, setLoadedEdit] = useState<MenuRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gramsNum = parseFloat(grams);
  const modeLabel =
    nutrientMode === "per100g"
      ? "100gあたり"
      : `1回分あたり（${Number.isNaN(gramsNum) ? "?" : gramsNum}g）`;

  const displayP = nutrientMode === "per100g" ? protein : toServing(protein, grams);
  const displayF = nutrientMode === "per100g" ? fat : toServing(fat, grams);
  const displayC = nutrientMode === "per100g" ? carbs : toServing(carbs, grams);

  const handleNutrientModeChange = useCallback((m: NutrientMode) => {
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setNutrientMode(m);
  }, []);

  const commitNutrientFromText = useCallback(
    (field: "p" | "f" | "c", rawText: string) => {
      const trimmed = rawText.trim();
      const stored = nutrientMode === "per100g" ? trimmed : to100g(trimmed, grams);
      if (field === "p") {
        setProtein(stored);
        setRawP(null);
      }
      if (field === "f") {
        setFat(stored);
        setRawF(null);
      }
      if (field === "c") {
        setCarbs(stored);
        setRawC(null);
      }
    },
    [nutrientMode, grams]
  );

  const resetAddForm = useCallback(() => {
    setName("");
    setProtein("");
    setFat("");
    setCarbs("");
    setGrams("100");
    setRank(2);
    setGroupName("");
    setNotes("");
    setNutrientMode("perServing");
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setLogMeal(mealTypeForLog);
    setLoadedEdit(null);
    setFormError(null);
    setConfirmDelete(false);
  }, [mealTypeForLog]);

  useEffect(() => {
    if (!visible || !state) return;
    setFormError(null);
    setConfirmDelete(false);
    if (state.kind === "add") {
      resetAddForm();
    }
  }, [visible, state, resetAddForm]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "add") return;
    let cancelled = false;
    (async () => {
      setRegisterRestaurantsLoading(true);
      const r = await fetchRestaurantsExcludingSnapshot(supabase, userId);
      if (cancelled) return;
      setRegisterRestaurantsLoading(false);
      if (r.error) {
        setRegisterRestaurants([]);
        setRegisterRestaurantId(null);
        return;
      }
      setRegisterRestaurants(r.restaurants);
      const hint = state.registerRestaurantIdHint;
      setRegisterRestaurantId((prev) => {
        if (hint && r.restaurants.some((x) => x.id === hint)) return hint;
        if (prev && r.restaurants.some((x) => x.id === prev)) return prev;
        return r.restaurants[0]?.id ?? null;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, supabase, userId]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "add" || !registerRestaurantId) {
      if (!visible || !state || state.kind !== "add") setExistingGroupNames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchDistinctMenuGroupNames(supabase, userId, registerRestaurantId);
      if (!cancelled && !r.error) setExistingGroupNames(r.names);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, registerRestaurantId, supabase, userId]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "edit") {
      setLoadedEdit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setEditLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select(
          "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, rank, notes, group_name, shared_barcode, standard_food_code"
        )
        .eq("id", state.menuItemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setEditLoading(false);
      if (error || !data) {
        setFormError(error?.message ?? "メニューを読み込めませんでした");
        setLoadedEdit(null);
        return;
      }
      const row = data as MenuRow;
      setLoadedEdit(row);
      setName(row.name);
      setProtein(row.protein_per_100g != null ? String(row.protein_per_100g) : "");
      setFat(row.fat_per_100g != null ? String(row.fat_per_100g) : "");
      setCarbs(row.carbs_per_100g != null ? String(row.carbs_per_100g) : "");
      setGrams(String(row.default_grams ?? 100));
      setRank(row.rank ?? 2);
      setGroupName(row.group_name ?? "");
      setNotes(row.notes ?? "");
      setNutrientMode("perServing");
      setRawP(null);
      setRawF(null);
      setRawC(null);
      setLogMeal(mealTypeForLog);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, supabase, userId, mealTypeForLog]);

  const buildMenuPayload = useCallback(() => {
    const gramsNum = parseFloat(grams) || 100;
    const n = (s: string) => {
      if (s.trim() === "") return null;
      const v = parseFloat(s);
      return Number.isFinite(v) ? v : null;
    };
    return {
      name: name.trim(),
      protein_per_100g: n(protein),
      fat_per_100g: n(fat),
      carbs_per_100g: n(carbs),
      default_grams: gramsNum,
      rank,
      notes: notes.trim() || null,
      group_name: groupName.trim() || null,
      shared_barcode: loadedEdit?.shared_barcode ?? null,
      standard_food_code: loadedEdit?.standard_food_code ?? null,
    };
  }, [name, protein, fat, carbs, grams, rank, notes, groupName, loadedEdit]);

  const registerTargetRestaurantName = useMemo(
    () => registerRestaurants.find((r) => r.id === registerRestaurantId)?.name ?? "",
    [registerRestaurants, registerRestaurantId]
  );

  const canRegisterMenu =
    !isEdit &&
    !registerRestaurantsLoading &&
    registerRestaurants.length > 0 &&
    registerRestaurantId != null;

  const applyMenuUpdate = useCallback(
    async (id: string, payload: ReturnType<typeof buildMenuPayload>) => {
      const { data: current, error: fetchErr } = await supabase
        .from("menu_items")
        .select("restaurant_id, group_name")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchErr || !current) {
        return { error: fetchErr?.message ?? "メニューが見つかりません" as string };
      }

      const prevGroupName =
        current.group_name == null ? null : String(current.group_name).trim() || null;
      const nextGroupName = payload.group_name?.trim() || null;
      const updateBody: Record<string, unknown> = {
        name: payload.name,
        protein_per_100g: payload.protein_per_100g,
        fat_per_100g: payload.fat_per_100g,
        carbs_per_100g: payload.carbs_per_100g,
        default_grams: payload.default_grams,
        rank: payload.rank,
        notes: payload.notes,
        group_name: nextGroupName,
        shared_barcode: payload.shared_barcode,
        standard_food_code: payload.standard_food_code,
      };

      if (prevGroupName !== nextGroupName) {
        updateBody.group_order = await resolveMenuItemGroupOrder(
          supabase,
          userId,
          current.restaurant_id as string,
          nextGroupName
        );
      }

      const { error } = await supabase.from("menu_items").update(updateBody).eq("id", id).eq(
        "user_id",
        userId
      );
      return { error: error?.message ?? null };
    },
    [supabase, userId]
  );

  const handleSaveMenu = useCallback(async () => {
    if (!name.trim()) {
      setFormError("名前を入力してください");
      return;
    }
    if (!state) return;
    const data = buildMenuPayload();

    setBusy(true);
    setFormError(null);
    const online = await getIsOnline();
    if (!online) {
      setBusy(false);
      setFormError("オフラインのときはメニューを保存できません。");
      return;
    }

    if (state.kind === "edit") {
      const { error } = await applyMenuUpdate(state.menuItemId, data);
      setBusy(false);
      if (error) {
        setFormError(error);
        onToast(`保存に失敗しました: ${error}`);
        return;
      }
      onToast("保存しました");
      onClose();
      await onSaved();
      return;
    }

    if (!registerRestaurantId) {
      setBusy(false);
      setFormError(
        registerRestaurants.length === 0
          ? "メニューに載せるお店がありません。店舗を追加してください。"
          : "メニュー登録先のお店を選んでください。"
      );
      return;
    }

    const groupNameTrim = data.group_name?.trim() || null;
    const groupOrder = await resolveMenuItemGroupOrder(
      supabase,
      userId,
      registerRestaurantId,
      groupNameTrim
    );

    const { error } = await supabase.from("menu_items").insert({
      user_id: userId,
      restaurant_id: registerRestaurantId,
      name: data.name,
      protein_per_100g: data.protein_per_100g,
      fat_per_100g: data.fat_per_100g,
      carbs_per_100g: data.carbs_per_100g,
      default_grams: data.default_grams,
      rank: data.rank,
      notes: data.notes,
      group_name: groupNameTrim,
      group_order: groupOrder,
      shared_barcode: null,
      standard_food_code: null,
    });

    setBusy(false);
    if (error) {
      setFormError(error.message);
      onToast(`メニュー登録に失敗しました: ${error.message}`);
      return;
    }
    onToast("メニューに登録しました");
    onClose();
    await onSaved();
  }, [
    name,
    buildMenuPayload,
    state,
    applyMenuUpdate,
    onClose,
    onSaved,
    onToast,
    registerRestaurantId,
    registerRestaurants.length,
    supabase,
    userId,
  ]);

  const buildSnapshotLogDraft = useCallback((): FoodLogOutboxDraft | null => {
    if (!snapshotRestaurantId) return null;
    if (!name.trim()) return null;
    const gramsNum = parseFloat(grams) || 100;
    const p100 = protein === "" ? null : parseFloat(protein);
    const f100 = fat === "" ? null : parseFloat(fat);
    const c100 = carbs === "" ? null : parseFloat(carbs);
    const v = pfcGramsFromNullablePer100(
      p100 !== null && Number.isFinite(p100) ? p100 : null,
      f100 !== null && Number.isFinite(f100) ? f100 : null,
      c100 !== null && Number.isFinite(c100) ? c100 : null,
      gramsNum
    );
    return {
      id: newClientRowId(),
      date,
      meal_type: logMeal,
      item_name: name.trim(),
      grams: gramsNum,
      protein_g: v.p,
      fat_g: v.f,
      carbs_g: v.c,
      source: snapshotRestaurantId,
      menu_item_id: null,
      saved_at: new Date().toISOString(),
    };
  }, [snapshotRestaurantId, name, grams, protein, fat, carbs, date, logMeal]);

  const handleLogOnly = useCallback(async () => {
    const draft = buildSnapshotLogDraft();
    if (!draft) {
      setFormError("記録用の店舗情報を読み込めていません。");
      return;
    }
    setBusy(true);
    setFormError(null);
    const online = await getIsOnline();
    if (!online) {
      await enqueueFoodLogDraft(userId, draft);
      setBusy(false);
      onToast("オフラインのため端末に保存しました。通信が戻ったら一覧から再送してください。");
      onClose();
      await onOutboxChanged?.();
      return;
    }
    const { error } = await supabase
      .from("food_log")
      .insert(buildFoodLogInsertPayload(userId, draft));
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        onToast("保存しました");
        onClose();
        await onSaved();
        return;
      }
      if (isTransientNetworkError(error)) {
        await enqueueFoodLogDraft(userId, draft);
        onToast("通信に失敗しました。端末に下書きを残しました。");
        onClose();
        await onOutboxChanged?.();
        return;
      }
      setFormError(error.message);
      onToast(`保存に失敗しました: ${error.message}`);
      return;
    }
    onToast("保存しました");
    onClose();
    await onSaved();
  }, [
    buildSnapshotLogDraft,
    supabase,
    userId,
    onClose,
    onSaved,
    onToast,
    onOutboxChanged,
  ]);

  const handleAddToCart = useCallback(() => {
    if (!name.trim()) {
      setFormError("名前を入力してください");
      return;
    }
    if (!snapshotRestaurantId) {
      setFormError("カートに載せる準備ができていません。");
      return;
    }
    const gramsNum = parseFloat(grams) || 100;
    onAddSnapshotDraftToCart({
      name: name.trim(),
      protein_per_100g: protein === "" ? null : parseFloat(protein),
      fat_per_100g: fat === "" ? null : parseFloat(fat),
      carbs_per_100g: carbs === "" ? null : parseFloat(carbs),
      grams: gramsNum,
    });
    onToast("カートに入れました");
    onClose();
  }, [name, grams, protein, fat, carbs, snapshotRestaurantId, onAddSnapshotDraftToCart, onToast, onClose]);

  const handleDelete = useCallback(async () => {
    if (!state || state.kind !== "edit") return;
    setDeleting(true);
    setFormError(null);
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", state.menuItemId)
      .eq("user_id", userId);
    setDeleting(false);
    if (error) {
      setFormError(error.message);
      onToast(`削除に失敗しました: ${error.message}`);
      return;
    }
    onToast("削除しました");
    onClose();
    await onSaved();
  }, [state, supabase, userId, onClose, onSaved, onToast]);

  const titleText = useMemo(() => {
    if (!state) return "";
    if (state.kind === "edit") return "メニュー編集";
    return registerTargetRestaurantName
      ? `${registerTargetRestaurantName}へメニューを追加`
      : "メニューを追加";
  }, [state, registerTargetRestaurantName]);

  if (!state) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {titleText}
            </Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={8}>
              <Text style={styles.headerCancel}>キャンセル</Text>
            </Pressable>
          </View>

          {isEdit && editLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollPad}
            >
              <View style={styles.field}>
                <Text style={styles.label}>名前</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="名前"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>1回の量（g）</Text>
                <TextInput
                  value={grams}
                  onChangeText={setGrams}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.gramsInput]}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <View style={styles.nutrientHeaderRow}>
                  <Text style={styles.label}>栄養素</Text>
                  <View style={styles.modeSwitch}>
                    {(["per100g", "perServing"] as NutrientMode[]).map((m) => {
                      const on = nutrientMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => !busy && handleNutrientModeChange(m)}
                          style={[styles.modeChip, on && styles.modeChipOn]}
                        >
                          <Text style={[styles.modeChipText, on && styles.modeChipTextOn]}>
                            {m === "per100g" ? "100gあたり" : `1回分（${Number.isNaN(gramsNum) ? "?" : gramsNum}g）`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.pfcGrid}>
                  {(
                    [
                      { label: "P タンパク質", raw: rawP, display: displayP, setRaw: setRawP, field: "p" as const },
                      { label: "F 脂質", raw: rawF, display: displayF, setRaw: setRawF, field: "f" as const },
                      { label: "C 糖質", raw: rawC, display: displayC, setRaw: setRawC, field: "c" as const },
                    ] as const
                  ).map(({ label, raw, display, setRaw, field }) => (
                    <View key={field} style={styles.pfcCell}>
                      <Text style={styles.pfcCellLabel}>{label}</Text>
                      <TextInput
                        value={raw ?? display}
                        onChangeText={(t) => setRaw(t)}
                        onEndEditing={(e) =>
                          commitNutrientFromText(field, e.nativeEvent.text)
                        }
                        placeholder="—"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="decimal-pad"
                        style={styles.pfcInput}
                        editable={!busy}
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.modeHint}>入力単位: {modeLabel}</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>ランク</Text>
                <View style={styles.rankGrid}>
                  {RANK_OPTIONS.map((opt) => {
                    const on = rank === opt.value;
                    return (
                      <View key={opt.value} style={styles.rankCell}>
                        <Pressable
                          onPress={() => !busy && setRank(opt.value)}
                          style={[styles.rankBtn, on && styles.rankBtnOn]}
                          disabled={busy}
                        >
                          <Text style={[styles.rankBtnText, on && styles.rankBtnTextOn]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>グループ名（任意）</Text>
                <View style={styles.groupRow}>
                  <TextInput
                    value={groupName}
                    onChangeText={(t) => {
                      setGroupName(t);
                      if (!groupSuggestOpen) setGroupSuggestOpen(true);
                    }}
                    placeholder="例: ホルモン系"
                    placeholderTextColor={COLORS.textMuted}
                    style={[styles.input, styles.groupInput]}
                    editable={!busy}
                  />
                  {existingGroupNames.length > 0 ? (
                    <Pressable
                      onPress={() => setGroupSuggestOpen((v) => !v)}
                      style={styles.candidateBtn}
                    >
                      <Text style={styles.candidateBtnText}>候補</Text>
                    </Pressable>
                  ) : null}
                </View>
                {existingGroupNames.length > 0 && groupSuggestOpen ? (
                  <View style={styles.suggestBox}>
                    {existingGroupNames.map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => {
                          setGroupName(g);
                          setGroupSuggestOpen(false);
                        }}
                        style={styles.suggestRow}
                      >
                        <Text style={styles.suggestRowText}>{g}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>メモ（任意）</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="例: 1切れ約15g"
                  placeholderTextColor={COLORS.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                  numberOfLines={MEMO_MIN_ROWS}
                  editable={!busy}
                />
              </View>

              {!isEdit ? (
                <View style={styles.field}>
                  <Text style={styles.label}>食事（記録で使用）</Text>
                  <View style={styles.mealRow}>
                    {MEALS.map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => !busy && setLogMeal(m)}
                        style={[styles.mealChip, logMeal === m && styles.mealChipOn]}
                      >
                        <Text
                          style={[styles.mealChipText, logMeal === m && styles.mealChipTextOn]}
                        >
                          {MEAL_LABEL[m]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {formError ? <Text style={styles.error}>{formError}</Text> : null}

              {isEdit ? (
                <>
                  <Pressable
                    onPress={() => void handleSaveMenu()}
                    disabled={busy}
                    style={[styles.btnPrimaryWide, busy && { opacity: 0.55 }]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>保存する</Text>
                    )}
                  </Pressable>

                  <View style={styles.deleteSection}>
                    {confirmDelete ? (
                      <View style={styles.deleteConfirmRow}>
                        <Pressable
                          onPress={() => setConfirmDelete(false)}
                          style={[styles.btnGhostWide, { flex: 1 }]}
                        >
                          <Text style={styles.btnGhostText}>キャンセル</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleDelete()}
                          disabled={deleting}
                          style={[styles.btnDangerWide, { flex: 1 }, deleting && { opacity: 0.5 }]}
                        >
                          <Text style={styles.btnDangerText}>
                            {deleting ? "削除中…" : "削除する"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteLink}>
                        <Text style={styles.deleteLinkText}>このメニューを削除</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.registerBox}>
                    <Text style={styles.label}>メニュー登録先</Text>
                    {registerRestaurantsLoading ? (
                      <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
                    ) : registerRestaurants.length === 0 ? (
                      <Text style={styles.hint}>お店がありません。店舗を追加してください。</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.registerChipScroll}
                      >
                        {registerRestaurants.map((r) => {
                          const on = r.id === registerRestaurantId;
                          return (
                            <Pressable
                              key={r.id}
                              onPress={() => !busy && setRegisterRestaurantId(r.id)}
                              style={[styles.registerChip, on && styles.registerChipOn]}
                            >
                              <Text
                                style={[styles.registerChipText, on && styles.registerChipTextOn]}
                                numberOfLines={1}
                              >
                                {r.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>

                  <Pressable
                    onPress={() => void handleSaveMenu()}
                    disabled={busy || !canRegisterMenu}
                    style={[styles.btnPrimaryWide, (busy || !canRegisterMenu) && { opacity: 0.55 }]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>メニューに登録</Text>
                    )}
                  </Pressable>
                  {!canRegisterMenu && !registerRestaurantsLoading ? (
                    <Text style={styles.hint}>
                      メニュー登録先のお店がないため、メニューへの登録はできません。
                    </Text>
                  ) : null}

                  <View style={styles.cartRow}>
                    <Pressable
                      onPress={handleAddToCart}
                      disabled={busy || !snapshotRestaurantId}
                      style={[styles.btnSecondaryHalf, (!snapshotRestaurantId || busy) && { opacity: 0.5 }]}
                    >
                      <Text style={styles.btnSecondaryText}>カートへ</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleLogOnly()}
                      disabled={busy || !snapshotRestaurantId}
                      style={[styles.btnSecondaryHalf, (!snapshotRestaurantId || busy) && { opacity: 0.5 }]}
                    >
                      <Text style={styles.btnSecondaryText}>今すぐ記録</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  headerCancel: {
    color: COLORS.textMuted,
    fontSize: 14,
    paddingTop: 2,
  },
  scrollPad: { paddingBottom: 32 },
  field: { marginBottom: 14 },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 16,
  },
  gramsInput: { maxWidth: 120 },
  nutrientHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  modeSwitch: { flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border },
  modeChip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#0f172a" },
  modeChipOn: { backgroundColor: COLORS.primary },
  modeChipText: { color: COLORS.textMuted, fontSize: 11 },
  modeChipTextOn: { color: "#fff", fontWeight: "600" },
  pfcGrid: { flexDirection: "row", gap: 8 },
  pfcCell: { flex: 1 },
  pfcCellLabel: { color: COLORS.textMuted, fontSize: 11, marginBottom: 4 },
  pfcInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 15,
    textAlign: "center",
  },
  modeHint: { color: COLORS.textMuted, fontSize: 11, marginTop: 6 },
  rankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rankCell: { width: "48%" },
  rankBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  rankBtnOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  rankBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "500" },
  rankBtnTextOn: { color: "#fff", fontWeight: "600" },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupInput: { flex: 1 },
  candidateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  candidateBtnText: { color: COLORS.text, fontSize: 12 },
  suggestBox: {
    marginTop: 8,
    maxHeight: 176,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: "#0f172a",
  },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  suggestRowText: { color: COLORS.text, fontSize: 14 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  mealChipOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.15)" },
  mealChipText: { color: COLORS.textMuted, fontSize: 13 },
  mealChipTextOn: { color: "#a7f3d0", fontWeight: "600" },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 10 },
  registerBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  registerChipScroll: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  registerChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
    maxWidth: 200,
  },
  registerChipOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.15)" },
  registerChipText: { color: COLORS.textMuted, fontSize: 13 },
  registerChipTextOn: { color: "#a7f3d0", fontWeight: "600" },
  btnPrimaryWide: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    minHeight: 48,
    marginBottom: 10,
  },
  btnPrimaryText: { color: "#022c22", fontWeight: "700", fontSize: 16 },
  cartRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  btnSecondaryHalf: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnSecondaryText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  deleteSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  deleteConfirmRow: { flexDirection: "row", gap: 8 },
  btnGhostWide: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: { color: COLORS.text, fontWeight: "600" },
  btnDangerWide: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
  },
  btnDangerText: { color: "#fff", fontWeight: "700" },
  deleteLink: { paddingVertical: 10 },
  deleteLinkText: { color: "#f87171", fontSize: 14, textAlign: "center" },
});
