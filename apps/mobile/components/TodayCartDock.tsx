import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MealType } from "@ketolog/types";
import { pfcGramsFromNullablePer100, type PfcGrams } from "@ketolog/domain/pfc";

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

function CartGramsEditor({
  grams,
  disabled,
  onCommit,
}: {
  grams: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [local, setLocal] = useState(String(grams));
  useEffect(() => {
    setLocal(String(grams));
  }, [grams]);
  return (
    <TextInput
      value={local}
      onChangeText={setLocal}
      onBlur={() => {
        const n = Number.parseFloat(local.replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) {
          onCommit(n);
        } else {
          setLocal(String(grams));
        }
      }}
      keyboardType="decimal-pad"
      editable={!disabled}
      style={styles.gramsInput}
    />
  );
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
  onRemoveLine: (menuItemId: string) => void;
  onUpdateGramsPerServing: (menuItemId: string, grams: number) => void;
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
  onRemoveLine,
  onUpdateGramsPerServing,
}: Props) {
  if (lines.length === 0) return null;

  const nItems = lines.reduce((s, l) => s + l.count, 0);
  const shell = CART_MEAL_CHIP_ACTIVE[mealType];

  return (
    <View
      style={[
        styles.shell,
        { borderTopColor: shell.border, backgroundColor: "rgba(15, 23, 42, 0.98)" },
      ]}
      accessibilityLabel="カート"
    >
      <Pressable
        onPress={onToggleExpanded}
        style={({ pressed }) => [styles.headerBar, pressed && { opacity: 0.88 }]}
      >
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>カート（{nItems}）</Text>
          <Text style={styles.headerSub}>
            {CART_MEAL_LABEL[mealType]}に記録 · P{fmtMacroGrams(cartPfc.p)} F{fmtMacroGrams(cartPfc.f)}{" "}
            C{fmtMacroGrams(cartPfc.c)}
          </Text>
        </View>
        <Text style={styles.chev}>{expanded ? "▼" : "▲"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.expanded}>
          <Text style={styles.mealLabel}>記録する食事</Text>
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

          <ScrollView style={styles.lineScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {lines.map((line) => {
              const totalGrams = line.gramsPerServing * line.count;
              const v = pfcGramsFromNullablePer100(
                line.protein_per_100g,
                line.fat_per_100g,
                line.carbs_per_100g,
                totalGrams
              );
              return (
                <View key={line.menuItemId} style={styles.lineRow}>
                  <View style={styles.lineBody}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.name}
                      <Text style={styles.countGrams}>
                        {" "}
                        ×{line.count}（{totalGrams}g）
                      </Text>
                    </Text>
                    <Text style={styles.linePfc}>
                      P{fmtMacroGrams(v.p)} F{fmtMacroGrams(v.f)} C{fmtMacroGrams(v.c)}
                    </Text>
                  </View>
                  <View style={styles.gramsCol}>
                    <Text style={styles.gramsLabel}>1回</Text>
                    <CartGramsEditor
                      grams={line.gramsPerServing}
                      disabled={saving}
                      onCommit={(n) => onUpdateGramsPerServing(line.menuItemId, n)}
                    />
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
  },
  headerMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  headerTitle: {
    color: "#f9fafb",
    fontSize: 16,
    fontWeight: "700",
  },
  headerSub: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  chev: { color: "#6b7280", fontSize: 14, paddingLeft: 4 },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1f2937",
  },
  mealLabel: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 6,
  },
  mealRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
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
  lineScroll: { maxHeight: 200, marginBottom: 8 },
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
  countGrams: { color: "#6b7280", fontSize: 12, fontWeight: "400" },
  linePfc: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  gramsCol: { alignItems: "center", width: 52 },
  gramsLabel: { color: "#6b7280", fontSize: 9, marginBottom: 2 },
  gramsInput: {
    width: 50,
    textAlign: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "#111827",
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
