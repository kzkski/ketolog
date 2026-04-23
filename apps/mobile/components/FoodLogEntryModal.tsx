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
import type { MealType } from "@ketolog/types";

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

type Props = {
  visible: boolean;
  mode: "add" | "edit";
  supabase: SupabaseClient;
  userId: string;
  date: string;
  entry: FoodLogRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
};

export function FoodLogEntryModal({
  visible,
  mode,
  supabase,
  userId,
  date,
  entry,
  onClose,
  onSaved,
  onToast,
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
      resetAddForm();
    }
  }, [visible, mode, entry, resetAddForm]);

  const runSaveAdd = useCallback(async () => {
    const name = itemName.trim();
    if (!name) {
      setFormError("品目名を入力してください");
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
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.from("food_log").insert({
      user_id: userId,
      date,
      meal_type: meal,
      item_name: name,
      grams,
      protein_g: v.p,
      fat_g: v.f,
      carbs_g: v.c,
      source: "manual",
      menu_item_id: null,
    });
    setBusy(false);
    if (error) {
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
    onClose,
    onSaved,
    onToast,
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

  const onSubmit = useCallback(() => {
    void (mode === "add" ? runSaveAdd() : runSaveEdit());
  }, [mode, runSaveAdd, runSaveEdit]);

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
          <Text style={styles.title}>
            {mode === "add" ? "食事を追加（手入力）" : "記録を編集"}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollPad}
          >
            {mode === "edit" ? (
              <View style={styles.field}>
                <Text style={styles.label}>品目</Text>
                <Text style={styles.readonly}>{itemName}</Text>
                <Text style={styles.hint}>
                  名称の変更は Web 版から行うか、いったん削除して追加してください。
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
                  editable={!busy}
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>食事</Text>
              <View style={styles.mealRow}>
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
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>分量（g）</Text>
              <TextInput
                value={gramsStr}
                onChangeText={setGramsStr}
                placeholder="200"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
                editable={!busy}
              />
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
                分量を変えると、もとの記録の PFC 比率に応じて再計算されます（Web
                版と同じ）。
              </Text>
            )}

            {formError ? <Text style={styles.error}>{formError}</Text> : null}

            <View style={styles.btnRow}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={[styles.btnGhost, busy && { opacity: 0.5 }]}
              >
                <Text style={styles.btnGhostText}>キャンセル</Text>
              </Pressable>
              <Pressable
                onPress={onSubmit}
                disabled={busy}
                style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#022c22" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {mode === "add" ? "保存" : "更新"}
                  </Text>
                )}
              </Pressable>
            </View>
            {formError ? (
              <Pressable
                onPress={onSubmit}
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
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  scrollPad: { paddingBottom: 28 },
  field: { marginBottom: 14 },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
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
  mealRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  mealChipOn: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  mealChipText: { color: COLORS.textMuted, fontSize: 13 },
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
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  btnGhost: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: { color: COLORS.text, fontWeight: "600" },
  btnPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    minHeight: 48,
  },
  btnPrimaryText: { color: "#022c22", fontWeight: "700" },
  retry: { alignItems: "center", marginTop: 12, padding: 8 },
  retryText: { color: "#93c5fd", fontSize: 14, fontWeight: "600" },
});
