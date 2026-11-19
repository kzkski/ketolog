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
import {
  barcodeValueSourceLabel,
  pickLatestOwnMenuItem,
  type BarcodePrefill,
  type OwnBarcodeMenuMatch,
} from "@ketolog/domain/barcode-menu-prefill";
import { getMealTypeForTimeZone } from "@ketolog/domain/meal-timezone";
import { formatGramsShort } from "@ketolog/domain/cart-serving";
import type { MealType } from "@ketolog/types";

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

function parseGrams(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initialGramsString(prefill: BarcodePrefill): string {
  const g = prefill.default_grams;
  if (g != null && g > 0) return String(g);
  return "100";
}

function servingHint(prefill: BarcodePrefill): string | null {
  if (prefill.source === "own_menu_item") return null;
  if (prefill.default_grams && prefill.default_grams > 0 && prefill.serving_size) {
    return `OFFの serving_size (${prefill.serving_size}) を1回量に仮入力しました。ラベルで必ず確認してください。`;
  }
  if (prefill.serving_size) {
    return `OFFの serving_size (${prefill.serving_size}) を取得しました。1回量(g)を手動で確認してください。`;
  }
  return null;
}

export type BarcodeQuickConfirmSheetProps = {
  visible: boolean;
  barcode: string;
  prefill: BarcodePrefill;
  ownMenuItems: OwnBarcodeMenuMatch[];
  loading?: boolean;
  busy: boolean;
  onClose: () => void;
  onRescan: () => void;
  onConfirm: (input: {
    mealType: MealType;
    grams: number;
    selectedOwnMenu: OwnBarcodeMenuMatch | null;
  }) => void | Promise<void>;
};

export function BarcodeQuickConfirmSheet({
  visible,
  barcode,
  prefill,
  ownMenuItems,
  loading = false,
  busy,
  onClose,
  onRescan,
  onConfirm,
}: BarcodeQuickConfirmSheetProps) {
  const [meal, setMeal] = useState<MealType>(() =>
    getMealTypeForTimeZone(new Date(), "Asia/Tokyo")
  );
  const [gramsStr, setGramsStr] = useState(() => initialGramsString(prefill));
  const [selectedOwnMenu, setSelectedOwnMenu] = useState<OwnBarcodeMenuMatch | null>(() =>
    pickLatestOwnMenuItem(ownMenuItems)
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMeal(getMealTypeForTimeZone(new Date(), "Asia/Tokyo"));
    setGramsStr(initialGramsString(prefill));
    setSelectedOwnMenu(pickLatestOwnMenuItem(ownMenuItems));
    setFormError(null);
    setPickerOpen(false);
  }, [visible, prefill, ownMenuItems, barcode]);

  const valueSourceNote = useMemo(() => barcodeValueSourceLabel(prefill), [prefill]);
  const hint = useMemo(() => servingHint(prefill), [prefill]);
  const showRestaurantPicker = prefill.source === "own_menu_item" && ownMenuItems.length > 1;
  const displayName =
    prefill.source === "own_menu_item" && selectedOwnMenu ? selectedOwnMenu.name : prefill.name;
  const restaurantLabel =
    prefill.source === "own_menu_item"
      ? (selectedOwnMenu?.restaurant_name ?? "—")
      : "スナップショット記録";

  const handleConfirm = useCallback(() => {
    const grams = parseGrams(gramsStr);
    if (grams == null || grams <= 0) {
      setFormError("分量（g）は正の数で入力してください");
      return;
    }
    if (prefill.source === "own_menu_item" && !selectedOwnMenu) {
      setFormError("記録するメニューを選んでください");
      return;
    }
    setFormError(null);
    void onConfirm({ mealType: meal, grams, selectedOwnMenu });
  }, [gramsStr, meal, onConfirm, prefill.source, selectedOwnMenu]);

  const gramsDraftNum = Number.parseFloat(gramsStr.replace(/,/g, ""));
  const gramsForHalve =
    Number.isFinite(gramsDraftNum) && gramsDraftNum > 0 ? gramsDraftNum : 100;

  const recordLabel = `${MEAL_LABEL[meal]}に記録`;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} disabled={busy} />
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>バーコード記録</Text>
              <Pressable onPress={onClose} disabled={busy} hitSlop={8}>
                <Text style={styles.headerCancel}>キャンセル</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollPad}>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.loadingText}>読み取り結果を検索中…</Text>
                </View>
              ) : null}

              <Text style={styles.barcode}>読み取り: {barcode}</Text>
              <Text style={styles.productName}>{displayName}</Text>
              <View style={styles.storeRow}>
                <Text style={styles.labelFlat}>店</Text>
                <Text style={styles.storeName}>{restaurantLabel}</Text>
                {showRestaurantPicker ? (
                  <Pressable
                    onPress={() => !busy && setPickerOpen(true)}
                    disabled={busy}
                    style={styles.changeBtn}
                  >
                    <Text style={styles.changeBtnText}>変更</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.valueSource}>{valueSourceNote}</Text>
              {hint ? <Text style={styles.warnHint}>{hint}</Text> : null}

              <View style={styles.field}>
                <View style={styles.mealGramsTopRow}>
                  <Text style={styles.labelFlat}>食事</Text>
                  <Text style={[styles.labelFlat, styles.gramsLabelAbove]}>分量（g）</Text>
                </View>
                <View style={styles.mealGramsBottomRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mealScrollContent}
                  >
                    {MEALS.map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => !busy && setMeal(m)}
                        style={[styles.mealChip, meal === m && styles.mealChipOn, busy && { opacity: 0.5 }]}
                      >
                        <Text style={[styles.mealChipText, meal === m && styles.mealChipTextOn]}>
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
                      placeholder="100"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="decimal-pad"
                      style={styles.gramsInputCompact}
                      editable={!busy}
                    />
                  </View>
                </View>
              </View>

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}

              <Pressable
                onPress={handleConfirm}
                disabled={busy || loading}
                style={[styles.primaryBtn, (busy || loading) && styles.primaryBtnDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>{recordLabel}</Text>
                )}
              </Pressable>

              <View style={styles.secondaryRow}>
                <Pressable onPress={onRescan} disabled={busy} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>もう一度読み取る</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>店舗を選ぶ</Text>
            {ownMenuItems.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => {
                  setSelectedOwnMenu(row);
                  setPickerOpen(false);
                }}
                style={[
                  styles.pickerRow,
                  selectedOwnMenu?.id === row.id && styles.pickerRowOn,
                ]}
              >
                <Text style={styles.pickerRowText}>
                  {row.restaurant_name ?? "（店名なし）"} — {row.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  card: {
    maxHeight: "92%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700", flex: 1 },
  headerCancel: { color: COLORS.textMuted, fontSize: 15 },
  scrollPad: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  barcode: { color: COLORS.textMuted, fontSize: 12 },
  productName: { color: COLORS.text, fontSize: 18, fontWeight: "600" },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  labelFlat: { color: COLORS.textMuted, fontSize: 12 },
  storeName: { color: COLORS.text, fontSize: 14, flex: 1 },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  changeBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },
  valueSource: { fontSize: 12, color: "#6ee7b7", lineHeight: 17 },
  warnHint: { fontSize: 12, color: "#fcd34d", lineHeight: 17 },
  field: { marginTop: 8 },
  mealGramsTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  gramsLabelAbove: { marginRight: 8 },
  mealGramsBottomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mealScrollContent: { gap: 6, paddingRight: 4 },
  mealChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  mealChipOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16,185,129,0.12)" },
  mealChipText: { color: COLORS.textMuted, fontSize: 13 },
  mealChipTextOn: { color: COLORS.primary, fontWeight: "600" },
  gramsEditCluster: { flexDirection: "row", alignItems: "center", gap: 6 },
  gramsInputCompact: {
    minWidth: 72,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 15,
    backgroundColor: "#0f172a",
  },
  formError: { color: COLORS.danger, fontSize: 13 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryRow: { alignItems: "center", marginTop: 4 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  secondaryBtnText: { color: COLORS.textMuted, fontSize: 14 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerCard: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
    maxHeight: "50%",
  },
  pickerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "600", marginBottom: 4 },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerRowOn: { borderColor: COLORS.primary },
  pickerRowText: { color: COLORS.text, fontSize: 14 },
});