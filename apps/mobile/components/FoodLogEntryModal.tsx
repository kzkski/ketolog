import { useCallback, useEffect, useState } from "react";
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
import { formatGramsShort } from "@ketolog/domain/cart-serving";
import type { MealType } from "@ketolog/types";

import type { MenuPrefill } from "../lib/menu-prefill";
import {
  buildFoodLogInsertPayload,
  enqueueFoodLogDraft,
  newClientRowId,
  type FoodLogOutboxDraft,
} from "../lib/food-log-outbox";
import { getIsOnline, isTransientNetworkError } from "../lib/network";
import { HalfGramsButton } from "./HalfGramsButton";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  danger: "#ef4444",
};

export type FoodLogRow = {
  id: string;
  date: string;
  meal_type: string;
  item_name: string;
  grams: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function per100FieldString(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

type Props = {
  visible: boolean;
  mode: "add" | "edit";
  supabase: SupabaseClient;
  userId: string;
  date: string;
  /** 手入力時の `food_log.source`（スナップショット店 UUID）。メニュー経路では未使用。 */
  snapshotRestaurantId: string | null;
  entry: FoodLogRow | null;
  /** メニューから開いたときのプリフィル。手入力のときは null。 */
  menuPrefill: MenuPrefill | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  /** 下書きキューが変わったとき（未送信一覧の更新） */
  onOutboxChanged?: () => void | Promise<void>;
};

export function FoodLogEntryModal({
  visible,
  mode,
  supabase,
  userId,
  date,
  snapshotRestaurantId,
  entry,
  menuPrefill,
  onClose,
  onSaved,
  onToast,
  onOutboxChanged,
}: Props) {
  const [meal, setMeal] = useState<MealType>("lunch");
  const [itemName, setItemName] = useState("");
  const [gramsStr, setGramsStr] = useState("");
  const [p100, setP100] = useState("");
  const [f100, setF100] = useState("");
  const [c100, setC100] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetAddForm = useCallback(() => {
    setMeal("lunch");
    setItemName("");
    setGramsStr("");
    setP100("");
    setF100("");
    setC100("");
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setFormError(null);
    if (mode === "edit" && entry) {
      const m = MEALS.includes(entry.meal_type as MealType)
        ? (entry.meal_type as MealType)
        : "lunch";
      setMeal(m);
      setItemName(entry.item_name);
      setGramsStr(String(entry.grams));
    } else if (mode === "add") {
      if (menuPrefill) {
        setMeal("lunch");
        setItemName(menuPrefill.itemName);
        setGramsStr(String(menuPrefill.defaultGrams));
        setP100(per100FieldString(menuPrefill.proteinPer100));
        setF100(per100FieldString(menuPrefill.fatPer100));
        setC100(per100FieldString(menuPrefill.carbsPer100));
      } else {
        resetAddForm();
      }
    }
  }, [visible, mode, entry, menuPrefill, resetAddForm]);

  const runSaveLogOnly = useCallback(async () => {
    const name = itemName.trim();
    if (!name) {
      setFormError("品目名を入力してください");
      return;
    }
    if (!menuPrefill && !snapshotRestaurantId) {
      setFormError(
        "手入力の店舗情報を取得できませんでした。通信を確認してから再度お試しください。"
      );
      return;
    }
    const sourceId = menuPrefill?.restaurantId ?? snapshotRestaurantId;
    if (!sourceId) {
      setFormError("保存できませんでした。しばらくしてから再度お試しください。");
      return;
    }
    const grams = parseNum(gramsStr);
    if (grams == null || grams <= 0) {
      setFormError("分量（g）は正の数で入力してください");
      return;
    }
    const pp = parseNum(p100);
    const fp = parseNum(f100);
    const cp = parseNum(c100);
    const v = pfcGramsFromNullablePer100(pp, fp, cp, grams);
    const rowId = newClientRowId();
    const draft: FoodLogOutboxDraft = {
      id: rowId,
      date,
      meal_type: meal,
      item_name: name,
      grams,
      protein_g: v.p,
      fat_g: v.f,
      carbs_g: v.c,
      source: sourceId,
      menu_item_id: menuPrefill?.menuItemId ?? null,
      saved_at: new Date().toISOString(),
    };

    setBusy(true);
    setFormError(null);

    const online = await getIsOnline();
    if (!online) {
      await enqueueFoodLogDraft(userId, draft);
      setBusy(false);
      onToast(
        "オフラインのため端末に保存しました。通信が戻ったら一覧から再送してください。"
      );
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
        onToast(
          "通信に失敗しました。端末に下書きを残しました。通信が戻ったら再送してください。"
        );
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
    itemName,
    gramsStr,
    p100,
    f100,
    c100,
    supabase,
    userId,
    date,
    meal,
    menuPrefill,
    onClose,
    onSaved,
    onToast,
    onOutboxChanged,
    snapshotRestaurantId,
  ]);

  const runSaveEdit = useCallback(async () => {
    if (!entry) return;
    const grams = parseNum(gramsStr);
    if (grams == null || grams <= 0) {
      setFormError("分量（g）は正の数で入力してください");
      return;
    }
    setBusy(true);
    setFormError(null);
    const { data: row, error: fetchErr } = await supabase
      .from("food_log")
      .select("grams, protein_g, fat_g, carbs_g")
      .eq("id", entry.id)
      .eq("user_id", userId)
      .single();

    if (fetchErr || !row) {
      setBusy(false);
      const msg = fetchErr?.message ?? "記録が見つかりません";
      setFormError(msg);
      onToast(msg);
      return;
    }

    const oldGrams = Number(row.grams) || 1;
    const pPer100 = ((Number(row.protein_g) || 0) * 100) / oldGrams;
    const fPer100 = ((Number(row.fat_g) || 0) * 100) / oldGrams;
    const cPer100 = ((Number(row.carbs_g) || 0) * 100) / oldGrams;
    const v = pfcGramsFromNullablePer100(pPer100, fPer100, cPer100, grams);

    const { error } = await supabase
      .from("food_log")
      .update({
        grams,
        meal_type: meal,
        protein_g: v.p,
        fat_g: v.f,
        carbs_g: v.c,
      })
      .eq("id", entry.id)
      .eq("user_id", userId);

    setBusy(false);
    if (error) {
      setFormError(error.message);
      onToast(`更新に失敗しました: ${error.message}`);
      return;
    }
    onToast("更新しました");
    onClose();
    await onSaved();
  }, [entry, gramsStr, meal, supabase, userId, onClose, onSaved, onToast]);

  const onSubmitLogOnly = useCallback(() => {
    void runSaveLogOnly();
  }, [runSaveLogOnly]);

  const onSubmitEdit = useCallback(() => {
    void runSaveEdit();
  }, [runSaveEdit]);

  const gramsDraftNum = Number.parseFloat(gramsStr.replace(/,/g, ""));
  const gramsForHalve =
    Number.isFinite(gramsDraftNum) && gramsDraftNum > 0
      ? gramsDraftNum
      : entry?.grams ?? 100;

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
              {mode === "add"
                ? menuPrefill
                  ? "食事を追加（メニュー）"
                  : "食事を追加（手入力）"
                : "記録を編集"}
            </Text>
            <Pressable
              onPress={onClose}
              disabled={busy}
              hitSlop={8}
              style={({ pressed }) => [
                busy && { opacity: 0.45 },
                pressed && !busy && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.headerCancel}>キャンセル</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollPad}
          >
            {mode === "edit" ? (
              <View style={styles.field}>
                <Text style={styles.label}>品目</Text>
                <Text style={styles.readonly}>{itemName}</Text>
                <Text style={styles.hint}>
                  名称の変更はメニュー編集から行うか、いったん削除して追加してください。
                </Text>
              </View>
            ) : (
              <View style={styles.field}>
                <Text style={styles.label}>品目名</Text>
                <TextInput
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="例: ささみソテー"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  editable={!busy && !menuPrefill}
                />
                {menuPrefill ? (
                  <Text style={styles.hint}>
                    メニューから読み込みました。名称の変更はメニュー編集で行ってください。
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.field}>
              <View style={styles.mealGramsTopRow}>
                <Text style={styles.labelFlat}>食事</Text>
                <Text style={[styles.labelFlat, styles.gramsLabelAbove]}>分量（g）</Text>
              </View>
              <View style={styles.mealGramsBottomRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mealScroll}
                  contentContainerStyle={styles.mealScrollContent}
                >
                  {MEALS.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => !busy && setMeal(m)}
                      style={[
                        styles.mealChip,
                        meal === m && styles.mealChipOn,
                        busy && { opacity: 0.5 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.mealChipText,
                          meal === m && styles.mealChipTextOn,
                        ]}
                      >
                        {MEAL_LABEL[m]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.gramsEditCluster}>
                  <HalfGramsButton
                    value={gramsForHalve}
                    disabled={busy}
                    size="compact"
                    onHalve={(next) => setGramsStr(formatGramsShort(next))}
                  />
                  <TextInput
                    value={gramsStr}
                    onChangeText={setGramsStr}
                    placeholder="200"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.gramsInputCompact}
                    editable={!busy}
                  />
                </View>
              </View>
            </View>

            {mode === "add" ? (
              <>
                <Text style={styles.sectionHint}>
                  100g あたりの PFC（食品表示などから入力。空欄は 0）
                </Text>
                <View style={styles.pfcRow}>
                  <View style={styles.pfcCol}>
                    <Text style={styles.label}>P / 100g</Text>
                    <TextInput
                      value={p100}
                      onChangeText={setP100}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      editable={!busy}
                    />
                  </View>
                  <View style={styles.pfcCol}>
                    <Text style={styles.label}>F / 100g</Text>
                    <TextInput
                      value={f100}
                      onChangeText={setF100}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      editable={!busy}
                    />
                  </View>
                  <View style={styles.pfcCol}>
                    <Text style={styles.label}>C / 100g</Text>
                    <TextInput
                      value={c100}
                      onChangeText={setC100}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      editable={!busy}
                    />
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.sectionHint}>
                分量を変えると、もとの記録の PFC 比率に応じて再計算されます。
              </Text>
            )}

            {formError ? <Text style={styles.error}>{formError}</Text> : null}

            <Pressable
              onPress={mode === "add" ? onSubmitLogOnly : onSubmitEdit}
              disabled={busy}
              style={[styles.btnPrimary, styles.btnPrimaryFull, busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color="#022c22" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {mode === "add" ? "保存" : "更新"}
                </Text>
              )}
            </Pressable>
            {formError ? (
              <Pressable
                onPress={mode === "edit" ? onSubmitEdit : onSubmitLogOnly}
                disabled={busy}
                style={styles.retry}
              >
                <Text style={styles.retryText}>再試行</Text>
              </Pressable>
            ) : null}
          </ScrollView>
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
    maxHeight: "88%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  headerCancel: {
    color: COLORS.textMuted,
    fontSize: 14,
    paddingTop: 2,
    fontWeight: "500",
  },
  scrollPad: { paddingBottom: 28 },
  field: { marginBottom: 14 },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  labelFlat: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  mealGramsTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  gramsLabelAbove: {
    minWidth: 120,
    textAlign: "right",
  },
  mealGramsBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealScroll: { flex: 1, minWidth: 0 },
  mealScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
  gramsEditCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  gramsInputCompact: {
    width: 76,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: COLORS.text,
    fontSize: 15,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
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
  readonly: {
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 8,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  mealChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  mealChipOn: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  mealChipText: { color: COLORS.textMuted, fontSize: 12 },
  mealChipTextOn: { color: "#a7f3d0", fontWeight: "600" },
  sectionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  pfcRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  pfcCol: { flex: 1 },
  error: {
    color: "#fecaca",
    fontSize: 13,
    marginBottom: 10,
  },
  btnPrimary: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    minHeight: 48,
  },
  btnPrimaryFull: {
    width: "100%",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#022c22", fontWeight: "700" },
  retry: { alignItems: "center", marginTop: 12, padding: 8 },
  retryText: { color: "#93c5fd", fontSize: 14, fontWeight: "600" },
});
