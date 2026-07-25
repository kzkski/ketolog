import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MealType } from "@ketolog/types";
import { pfcGramsFromNullablePer100, type PfcGrams } from "@ketolog/domain/pfc";
import {
  decrementCount,
  formatCount,
  formatGramsShort,
  HALF_COUNT,
  incrementCount,
  isRemovableCount,
  MIN_GRAMS,
  roundGrams,
  toggleHalfCount,
  totalGramsForLine,
} from "@ketolog/domain/cart-serving";
import { HalfGramsButton } from "./HalfGramsButton";

export type CartLineState = {
  menuItemId: string;
  restaurantId: string;
  name: string;
  gramsPerServing: number;
  count: number;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  /** メニュー未登録の下書き行。記録時は `menu_item_id` を null にする */
  snapshotDraft?: boolean;
  /** スナップショット由来の市販品バーコード（表示用・Web `CartPanel` に相当） */
  shared_barcode?: string | null;
};

export const CART_MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const CART_MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

/** Web `MEAL_CART_SEGMENT_ACTIVE` に相当 */
export const CART_MEAL_CHIP_ACTIVE: Record<MealType, { border: string; bg: string; text: string }> = {
  breakfast: { border: "#fb7185", bg: "rgba(244, 63, 94, 0.22)", text: "#fecdd3" },
  lunch: { border: "#22d3ee", bg: "rgba(34, 211, 238, 0.18)", text: "#cffafe" },
  dinner: { border: "#a78bfa", bg: "rgba(167, 139, 250, 0.2)", text: "#ede9fe" },
  snack: { border: "#2dd4bf", bg: "rgba(45, 212, 191, 0.18)", text: "#ccfbf1" },
};

function fmtMacroGrams(n: number) {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

type Props = {
  lines: CartLineState[];
  expanded: boolean;
  onToggleExpanded: () => void;
  cartPfc: PfcGrams;
  mealType: MealType;
  onMealType: (m: MealType) => void;
  saving: boolean;
  onSave: () => void;
  onClearAll: () => void;
  onRemoveLine: (menuItemId: string) => void;
  onUpdateGramsPerServing: (menuItemId: string, grams: number) => void;
  onChangeCount: (menuItemId: string, count: number) => void;
};

export function TodayCartDock({
  lines,
  expanded,
  onToggleExpanded,
  cartPfc,
  mealType,
  onMealType,
  saving,
  onSave,
  onClearAll,
  onRemoveLine,
  onUpdateGramsPerServing,
  onChangeCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [gramsSheetForId, setGramsSheetForId] = useState<string | null>(null);
  const [sheetDraft, setSheetDraft] = useState("");

  const sheetLine = useMemo(
    () => (gramsSheetForId ? lines.find((l) => l.menuItemId === gramsSheetForId) : undefined),
    [gramsSheetForId, lines]
  );

  /** カートから該当行が消えたらモーダルを閉じる（状態リセットは次に開くときに上書き） */
  const gramsSheetVisible =
    gramsSheetForId != null && lines.some((l) => l.menuItemId === gramsSheetForId);

  function openGramsSheet(menuItemId: string) {
    if (saving) return;
    const line = lines.find((l) => l.menuItemId === menuItemId);
    setSheetDraft(line ? formatGramsShort(line.gramsPerServing) : "");
    setGramsSheetForId(menuItemId);
  }

  function closeGramsSheet() {
    Keyboard.dismiss();
    setGramsSheetForId(null);
  }

  function applySheetDelta(delta: number) {
    const v = Number.parseFloat(sheetDraft.replace(/,/g, ""));
    const base = Number.isFinite(v) && v > 0 ? v : 1;
    setSheetDraft(formatGramsShort(Math.max(MIN_GRAMS, roundGrams(base + delta))));
  }

  function commitGramsSheet() {
    if (!gramsSheetForId || saving) return;
    const n = Number.parseFloat(sheetDraft.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      if (sheetLine) setSheetDraft(formatGramsShort(sheetLine.gramsPerServing));
      return;
    }
    onUpdateGramsPerServing(gramsSheetForId, n);
    Keyboard.dismiss();
    setGramsSheetForId(null);
  }

  const expandedMaxHeight = useMemo(
    () => Math.max(220, Math.min(360, Math.floor(windowHeight * 0.44))),
    [windowHeight]
  );
  /** `expanded` に固定高がないと `flex:1` だけの領域は 0 高になる。行一覧は明示 maxHeight で確保する */
  const lineListMaxHeight = useMemo(
    () => Math.max(120, Math.min(220, Math.floor(windowHeight * 0.26))),
    [windowHeight]
  );

  if (lines.length === 0) return null;

  const nItems = lines.length;
  const shell = CART_MEAL_CHIP_ACTIVE[mealType];
  const sheetDraftNum = Number.parseFloat(sheetDraft.replace(/,/g, ""));
  const sheetGramsValue =
    Number.isFinite(sheetDraftNum) && sheetDraftNum > 0
      ? sheetDraftNum
      : sheetLine?.gramsPerServing ?? 1;

  return (
    <>
      <Modal
        visible={gramsSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeGramsSheet}
      >
        <View style={styles.modalOuter}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeGramsSheet}
            accessibilityLabel="閉じる"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
            style={styles.modalKav}
          >
          <View
            style={[
              styles.gramsSheet,
              { paddingBottom: Math.max(insets.bottom, 12) + 8 },
            ]}
          >
            <Text style={styles.gramsSheetTitle} numberOfLines={2}>
              {sheetLine?.name ?? ""}
            </Text>
            <Text style={styles.gramsSheetSubtitle}>1回あたり（g）</Text>
            <View style={styles.gramsStepRow}>
              <HalfGramsButton
                value={sheetGramsValue}
                disabled={saving}
                size="compact"
                onHalve={(next) => setSheetDraft(formatGramsShort(next))}
              />
              <Pressable
                onPress={() => applySheetDelta(-5)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.stepBtnText}>−5</Text>
              </Pressable>
              <Pressable
                onPress={() => applySheetDelta(-1)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <TextInput
                value={sheetDraft}
                onChangeText={setSheetDraft}
                keyboardType="decimal-pad"
                editable={!saving}
                selectTextOnFocus
                style={styles.gramsSheetInput}
                accessibilityLabel="1回あたりのグラム数"
              />
              <Pressable
                onPress={() => applySheetDelta(1)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
              <Pressable
                onPress={() => applySheetDelta(5)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.stepBtnText}>+5</Text>
              </Pressable>
            </View>
            <View style={styles.gramsSheetActions}>
              <Pressable
                onPress={closeGramsSheet}
                disabled={saving}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.88 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </Pressable>
              <Pressable
                onPress={commitGramsSheet}
                disabled={saving}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  pressed && { opacity: 0.92 },
                  saving && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.confirmBtnText}>確定</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <View
      style={[
        styles.shell,
        { borderTopColor: shell.border, backgroundColor: "rgba(15, 23, 42, 0.98)" },
      ]}
      accessibilityLabel="カート"
    >
      <View style={styles.headerBar}>
        <Pressable
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.headerMainTap, pressed && { opacity: 0.88 }]}
        >
          <View style={styles.headerMain}>
            <Text style={styles.headerTitle}>カート（{nItems}品）</Text>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onClearAll}
            disabled={saving}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, (pressed || saving) && { opacity: 0.75 }]}
            accessibilityLabel="カートを空にする"
          >
            <Text style={styles.clearBtnText}>🗑 空にする</Text>
          </Pressable>
          <Pressable
            onPress={onToggleExpanded}
            hitSlop={8}
            style={({ pressed }) => [styles.chevBtn, pressed && { opacity: 0.75 }]}
            accessibilityLabel={expanded ? "カートを閉じる" : "カートを開く"}
          >
            <Text style={styles.chev}>{expanded ? "▼" : "▲"}</Text>
          </Pressable>
        </View>
      </View>

      {expanded ? (
        <View style={[styles.expanded, { maxHeight: expandedMaxHeight }]}>
          <View style={styles.mealRow}>
            {CART_MEAL_ORDER.map((m) => {
              const on = mealType === m;
              const a = CART_MEAL_CHIP_ACTIVE[m];
              return (
                <Pressable
                  key={m}
                  onPress={() => !saving && onMealType(m)}
                  style={[
                    styles.mealChip,
                    on && { borderColor: a.border, backgroundColor: a.bg },
                    !on && styles.mealChipOff,
                    saving && { opacity: 0.45 },
                  ]}
                >
                  <Text style={[styles.mealChipText, on && { color: a.text }, !on && styles.mealChipTextOff]}>
                    {CART_MEAL_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={[styles.lineScroll, { maxHeight: lineListMaxHeight }]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {lines.map((line) => {
              const totalGrams = totalGramsForLine(line);
              const v = pfcGramsFromNullablePer100(
                line.protein_per_100g,
                line.fat_per_100g,
                line.carbs_per_100g,
                totalGrams
              );
              const isHalfCount = line.count === HALF_COUNT;
              return (
                <View key={line.menuItemId} style={styles.lineRow}>
                  <View style={styles.lineBody}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.name}
                    </Text>
                    <Text style={styles.linePfc}>
                      P{fmtMacroGrams(v.p)} F{fmtMacroGrams(v.f)} C{fmtMacroGrams(v.c)}
                    </Text>
                  </View>
                  <View style={styles.countCol}>
                    <Pressable
                      onPress={() => {
                        const next = decrementCount(line.count);
                        if (isRemovableCount(next)) onRemoveLine(line.menuItemId);
                        else onChangeCount(line.menuItemId, next);
                      }}
                      disabled={saving}
                      style={({ pressed }) => [
                        styles.countBtn,
                        pressed && { opacity: 0.8 },
                        saving && { opacity: 0.45 },
                      ]}
                      accessibilityLabel="回数を減らす"
                    >
                      <Text style={styles.countBtnText}>−</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onChangeCount(line.menuItemId, toggleHalfCount(line.count))}
                      disabled={saving}
                      style={({ pressed }) => [
                        styles.countValueBtn,
                        isHalfCount && styles.countValueHalf,
                        pressed && { opacity: 0.85 },
                        saving && { opacity: 0.45 },
                      ]}
                      accessibilityLabel={
                        isHalfCount ? "回数を1に戻す" : "回数を0.5にする"
                      }
                    >
                      <Text
                        style={[
                          styles.countValueText,
                          isHalfCount && styles.countValueTextHalf,
                        ]}
                      >
                        {formatCount(line.count)}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        onChangeCount(line.menuItemId, incrementCount(line.count))
                      }
                      disabled={saving}
                      style={({ pressed }) => [
                        styles.countBtn,
                        pressed && { opacity: 0.8 },
                        saving && { opacity: 0.45 },
                      ]}
                      accessibilityLabel="回数を増やす"
                    >
                      <Text style={styles.countBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={styles.gramsCol}>
                    <HalfGramsButton
                      value={line.gramsPerServing}
                      disabled={saving}
                      size="mini"
                      onHalve={(next) => onUpdateGramsPerServing(line.menuItemId, next)}
                    />
                    <Pressable
                      onPress={() => openGramsSheet(line.menuItemId)}
                      disabled={saving}
                      style={({ pressed }) => [
                        styles.gramsTap,
                        pressed && { opacity: 0.88 },
                        saving && { opacity: 0.45 },
                      ]}
                      accessibilityLabel="1回あたりのグラムを編集"
                    >
                      <Text style={styles.gramsTapValue}>
                        {formatGramsShort(line.gramsPerServing)}g
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => onRemoveLine(line.menuItemId)}
                    disabled={saving}
                    hitSlop={8}
                    style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.75 }]}
                    accessibilityLabel="カートから外す"
                  >
                    <Text style={styles.removeBtnText}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footerRow}>
            <Text style={styles.totalPfc} numberOfLines={2}>
              合計 P<Text style={styles.totalNum}>{fmtMacroGrams(cartPfc.p)}</Text> F
              <Text style={styles.totalNum}>{fmtMacroGrams(cartPfc.f)}</Text> C
              <Text style={styles.totalNum}>{fmtMacroGrams(cartPfc.c)}</Text>g
            </Text>
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={({ pressed }) => [styles.saveBtn, saving && { opacity: 0.5 }, pressed && !saving && { opacity: 0.92 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>記録する</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: 2,
    paddingBottom: 10,
    paddingTop: 4,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    minHeight: 48,
  },
  headerMainTap: { flex: 1, minWidth: 0, paddingVertical: 2 },
  headerMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  headerTitle: {
    color: "#f9fafb",
    fontSize: 16,
    fontWeight: "700",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "rgba(17, 24, 39, 0.7)",
  },
  clearBtnText: { color: "#d1d5db", fontSize: 11, fontWeight: "600" },
  chevBtn: { paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8 },
  chev: { color: "#6b7280", fontSize: 14, paddingLeft: 4 },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1f2937",
    overflow: "hidden",
  },
  mealRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  mealChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
  },
  mealChipOff: {
    borderColor: "rgba(55, 65, 81, 0.9)",
    backgroundColor: "rgba(31, 41, 55, 0.7)",
  },
  mealChipText: { fontSize: 11, fontWeight: "700" },
  mealChipTextOff: { color: "#6b7280" },
  lineScroll: { marginBottom: 8 },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(31, 41, 55, 0.8)",
    gap: 8,
  },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { color: "#e5e7eb", fontSize: 14, fontWeight: "500" },
  linePfc: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  countCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  countBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  countBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  countValueBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  countValueHalf: {
    borderWidth: 1,
    borderColor: "#10b981",
  },
  countValueText: {
    color: "#34d399",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  countValueTextHalf: { color: "#a7f3d0" },
  gramsCol: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    minHeight: 44,
    gap: 2,
  },
  gramsTap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  gramsTapValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  modalOuter: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalKav: {
    width: "100%",
  },
  gramsSheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#374151",
  },
  gramsSheetTitle: {
    color: "#f9fafb",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  gramsSheetSubtitle: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 12,
  },
  gramsStepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  stepBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4b5563",
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    color: "#e5e7eb",
    fontSize: 16,
    fontWeight: "700",
  },
  gramsSheetInput: {
    minWidth: 72,
    textAlign: "center",
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#059669",
    backgroundColor: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  gramsSheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  cancelBtnText: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: "#059669",
    minWidth: 100,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  removeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  removeBtnText: { color: "#9ca3af", fontSize: 22, fontWeight: "400" },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1f2937",
  },
  totalPfc: {
    flex: 1,
    color: "#d1d5db",
    fontSize: 14,
    minWidth: 0,
  },
  totalNum: { color: "#fff", fontWeight: "700" },
  saveBtn: {
    backgroundColor: "#059669",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
