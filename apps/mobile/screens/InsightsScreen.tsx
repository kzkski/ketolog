import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { MealType } from "@ketolog/types";
import { addDaysJst } from "@ketolog/domain/date";
import {
  buildInsights,
  getPresetRange,
  getTodayJstDate,
  type InsightFoodLogEntry,
} from "@ketolog/domain/insights";
import { useAuthSessionContext } from "../contexts/AuthSessionContext";
import { loadFoodLogOutbox } from "../lib/food-log-outbox";
import { getSupabase } from "../lib/supabase";
import { fetchInsightsFoodLogForDateRange } from "../lib/fetch-insights-food-log-mobile";
import { shareUtf8JsonFile } from "../lib/share-json-mobile";
import { InsightsPfcChart } from "../components/InsightsPfcChart";

const COLORS = {
  bg: "#0a0a0a",
  card: "#111827",
  border: "#1f2937",
  text: "#e5e7eb",
  muted: "#9ca3af",
  err: "#f87171",
  accent: "#059669",
  btnBg: "#374151",
};

const MEAL_LABEL_FULL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const CUSTOM_RANGE_MAX_DAYS = 90;

type Preset = "7d" | "30d" | "custom";
type MealFilter = MealType | "all";

function fmtNum(v: number): string {
  return v.toFixed(1);
}

function ratioFlex(total: number, part: number): { flex: number } {
  if (total <= 0) return { flex: 0 };
  return { flex: Math.max(0, Math.min(1, part / total)) };
}

function jstDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  ];
  return `${date}（${weekday}）`;
}

function toIsoNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function InsightsScreen() {
  const router = useRouter();
  const { session } = useAuthSessionContext();
  const userId = session?.user.id ?? "";
  const supabase = getSupabase();

  const today = useMemo(() => getTodayJstDate(), []);
  const preset7 = useMemo(() => getPresetRange(today, 7), [today]);

  const [preset, setPreset] = useState<Preset>("7d");
  const [mealFilter, setMealFilter] = useState<MealFilter>("all");
  const [start, setStart] = useState(preset7.start);
  const [end, setEnd] = useState(preset7.end);
  const [entries, setEntries] = useState<InsightFoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [outboxLoaded, setOutboxLoaded] = useState(false);
  const [outboxHasUnsent, setOutboxHasUnsent] = useState(false);

  const loadRange = useCallback(
    async (
      nextStart: string,
      nextEnd: string,
      nextPreset: Preset,
      nextMealFilter: MealFilter = mealFilter
    ) => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      const mealTypes = nextMealFilter === "all" ? undefined : [nextMealFilter];
      const result = await fetchInsightsFoodLogForDateRange(
        supabase,
        userId,
        nextStart,
        nextEnd,
        mealTypes
      );
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreset(nextPreset);
      setMealFilter(nextMealFilter);
      setStart(nextStart);
      setEnd(nextEnd);
      setEntries(result.entries);
      setExpanded(new Set());
    },
    [supabase, userId, mealFilter]
  );

  useEffect(() => {
    if (!userId) return;
    const id = requestAnimationFrame(() => {
      void loadRange(preset7.start, preset7.end, "7d");
    });
    return () => cancelAnimationFrame(id);
  }, [userId, loadRange, preset7.start, preset7.end]);

  const refreshOutbox = useCallback(async () => {
    if (!userId) return;
    const drafts = await loadFoodLogOutbox(userId);
    setOutboxHasUnsent(drafts.length > 0);
    setOutboxLoaded(true);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void refreshOutbox();
    }, [userId, refreshOutbox])
  );

  const insight = useMemo(
    () =>
      buildInsights(entries, start, end, {
        mealTypes: mealFilter === "all" ? undefined : [mealFilter],
      }),
    [entries, start, end, mealFilter]
  );
  const avgTotal =
    insight.summary.avgProtein + insight.summary.avgFat + insight.summary.avgCarbs;
  const avgProteinPct = avgTotal > 0 ? (insight.summary.avgProtein / avgTotal) * 100 : 0;
  const avgFatPct = avgTotal > 0 ? (insight.summary.avgFat / avgTotal) * 100 : 0;
  const avgCarbsPct = avgTotal > 0 ? (insight.summary.avgCarbs / avgTotal) * 100 : 0;

  function validateCustomRange(nextStart: string, nextEnd: string): string | null {
    if (nextStart > nextEnd) return "開始日は終了日以前にしてください。";
    if (nextEnd > today) return "終了日は今日以前にしてください。";
    const maxEnd = addDaysJst(nextStart, CUSTOM_RANGE_MAX_DAYS - 1);
    if (nextEnd > maxEnd) return `カスタム期間は最大${CUSTOM_RANGE_MAX_DAYS}日です。`;
    return null;
  }

  async function sharePeriodJson() {
    setShareErr(null);
    const payload = {
      kind: "ketolog_insights_export",
      version: 1,
      period: {
        start,
        end,
        preset,
        mealTypes: mealFilter === "all" ? [...MEAL_TYPES] : [mealFilter],
      },
      exportedAt: new Date().toISOString(),
      entries,
    };
    const res = await shareUtf8JsonFile(
      `ketolog-insights-${start}-${end}-${toIsoNow()}.json`,
      JSON.stringify(payload, null, 2)
    );
    if (res.error) setShareErr(res.error);
  }

  function toggleDate(date: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centered}>
          <Text style={styles.muted}>ログインが必要です</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>分析</Text>
          <Pressable
            onPress={() => router.replace("/(app)/today")}
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.closeBtnText}>閉じる</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>JST の日付で集計します</Text>
      </View>

      {outboxLoaded && outboxHasUnsent ? (
        <View
          style={styles.outboxBanner}
          accessibilityRole="alert"
          accessibilityLabel="未送信の下書きは分析に含まれません。Todayで再送または破棄できます。"
        >
          <Ionicons name="alert-circle" size={18} color="#fcd34d" style={styles.outboxIcon} />
          <Text style={styles.outboxText}>
            未送信の下書きはクラウドに未同期のため、この分析の集計には含まれません。Today
            の「未送信の下書き」から再送するか、破棄してください。
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.presetRow}>
            <Pressable
              onPress={() => {
                const range = getPresetRange(today, 7);
                void loadRange(range.start, range.end, "7d");
              }}
              disabled={loading}
              style={({ pressed }) => [
                styles.presetBtn,
                preset === "7d" && styles.presetBtnOn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.presetBtnText, preset === "7d" && styles.presetBtnTextOn]}>
                過去7日
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const range = getPresetRange(today, 30);
                void loadRange(range.start, range.end, "30d");
              }}
              disabled={loading}
              style={({ pressed }) => [
                styles.presetBtn,
                preset === "30d" && styles.presetBtnOn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.presetBtnText, preset === "30d" && styles.presetBtnTextOn]}>
                過去30日
              </Text>
            </Pressable>
            <View style={styles.presetSpacer} />
            <Pressable
              onPress={() => void sharePeriodJson()}
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="share-outline" size={18} color={COLORS.text} />
              <Text style={styles.shareBtnText}>共有</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>カスタムは最大{CUSTOM_RANGE_MAX_DAYS}日</Text>
          {shareErr ? <Text style={styles.errSmall}>{shareErr}</Text> : null}
          <View style={styles.mealFilterRow}>
            <Pressable
              onPress={() => {
                void loadRange(start, end, preset, "all");
              }}
              disabled={loading}
              style={({ pressed }) => [
                styles.mealFilterBtn,
                mealFilter === "all" && styles.mealFilterBtnOn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.5 },
              ]}
            >
              <Text
                style={[
                  styles.mealFilterBtnText,
                  mealFilter === "all" && styles.mealFilterBtnTextOn,
                ]}
              >
                すべて
              </Text>
            </Pressable>
            {MEAL_TYPES.map((mealType) => (
              <Pressable
                key={mealType}
                onPress={() => {
                  void loadRange(start, end, preset, mealType);
                }}
                disabled={loading}
                style={({ pressed }) => [
                  styles.mealFilterBtn,
                  mealFilter === mealType && styles.mealFilterBtnOn,
                  pressed && { opacity: 0.85 },
                  loading && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[
                    styles.mealFilterBtnText,
                    mealFilter === mealType && styles.mealFilterBtnTextOn,
                  ]}
                >
                  {MEAL_LABEL_FULL[mealType]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>開始（YYYY-MM-DD）</Text>
              <TextInput
                value={start}
                onChangeText={setStart}
                placeholder="2026-01-01"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.dateInput}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>終了</Text>
              <TextInput
                value={end}
                onChangeText={setEnd}
                placeholder="2026-01-31"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.dateInput}
              />
            </View>
            <Pressable
              onPress={() => {
                const v = validateCustomRange(start, end);
                if (v) {
                  setError(v);
                  return;
                }
                void loadRange(start, end, "custom");
              }}
              disabled={loading}
              style={({ pressed }) => [
                styles.applyBtn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.applyBtnText}>適用</Text>
            </Pressable>
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.muted} />
              <Text style={styles.loadingText}>読み込み中…</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>平均PFCバランス</Text>
          <View style={styles.avgGrid}>
            <View style={styles.avgCell}>
              <Text style={styles.avgCap}>たんぱく質 (P)</Text>
              <Text style={[styles.avgVal, { color: "#93c5fd" }]}>
                {fmtNum(insight.summary.avgProtein)} g
              </Text>
              <Text style={styles.avgPct}>{fmtNum(avgProteinPct)}%</Text>
            </View>
            <View style={styles.avgCell}>
              <Text style={styles.avgCap}>脂質 (F)</Text>
              <Text style={[styles.avgVal, { color: "#fde047" }]}>
                {fmtNum(insight.summary.avgFat)} g
              </Text>
              <Text style={styles.avgPct}>{fmtNum(avgFatPct)}%</Text>
            </View>
            <View style={styles.avgCell}>
              <Text style={styles.avgCap}>糖質 (C)</Text>
              <Text style={[styles.avgVal, { color: "#6ee7b7" }]}>
                {fmtNum(insight.summary.avgCarbs)} g
              </Text>
              <Text style={styles.avgPct}>{fmtNum(avgCarbsPct)}%</Text>
            </View>
          </View>
          <View style={styles.ratioBar}>
            <View style={[styles.ratioSeg, { backgroundColor: "#60a5fa" }, ratioFlex(avgTotal, insight.summary.avgProtein)]} />
            <View style={[styles.ratioSeg, { backgroundColor: "#facc15" }, ratioFlex(avgTotal, insight.summary.avgFat)]} />
            <View style={[styles.ratioSeg, { backgroundColor: "#34d399" }, ratioFlex(avgTotal, insight.summary.avgCarbs)]} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>日次PFC推移</Text>
          <InsightsPfcChart data={insight.chart} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>日ごとの食事一覧</Text>
          {insight.daily.map((day) => {
            const isOpen = expanded.has(day.date);
            const total = day.protein + day.fat + day.carbs;
            return (
              <View key={day.date} style={styles.dayBlock}>
                <Pressable onPress={() => toggleDate(day.date)} style={styles.dayHeader}>
                  <View style={styles.dayHeaderMain}>
                    <Text style={styles.dayTitle} numberOfLines={1}>
                      {isOpen ? "▼" : "▶"} {jstDateLabel(day.date)}
                    </Text>
                    <View style={styles.dayPfcRow}>
                      <Text style={[styles.dayPfc, { color: "#93c5fd" }]}>{fmtNum(day.protein)}</Text>
                      <Text style={[styles.dayPfc, { color: "#fde047" }]}>{fmtNum(day.fat)}</Text>
                      <Text style={[styles.dayPfc, { color: "#6ee7b7" }]}>{fmtNum(day.carbs)}</Text>
                    </View>
                    <View style={styles.ratioBar}>
                      <View style={[styles.ratioSeg, { backgroundColor: "#60a5fa" }, ratioFlex(total, day.protein)]} />
                      <View style={[styles.ratioSeg, { backgroundColor: "#facc15" }, ratioFlex(total, day.fat)]} />
                      <View style={[styles.ratioSeg, { backgroundColor: "#34d399" }, ratioFlex(total, day.carbs)]} />
                    </View>
                  </View>
                  <Text style={styles.dayCount}>{day.entries.length} 件</Text>
                </Pressable>
                {isOpen ? (
                  <View style={styles.dayBody}>
                    <View style={styles.entryHeaderRow}>
                      <Text style={styles.entryHdr}>項目</Text>
                      <Text style={[styles.entryHdr, styles.entryHdrNum]}>g</Text>
                      <Text style={[styles.entryHdr, styles.entryHdrPfc]}>P</Text>
                      <Text style={[styles.entryHdr, styles.entryHdrPfc]}>F</Text>
                      <Text style={[styles.entryHdr, styles.entryHdrPfc]}>C</Text>
                    </View>
                    {day.entries.length === 0 ? (
                      <Text style={styles.mutedSmall}>記録なし</Text>
                    ) : (
                      day.entries.map((entry) => (
                        <View key={entry.id} style={styles.entryRow}>
                          <Text style={styles.entryName} numberOfLines={2}>
                            <Text style={styles.mealTag}>
                              [{MEAL_LABEL_FULL[entry.meal_type as MealType] ?? entry.meal_type}]
                            </Text>{" "}
                            {entry.item_name}
                          </Text>
                          <Text style={styles.entryG}>{fmtNum(entry.grams)}</Text>
                          <Text style={[styles.entryPfc, { color: "#93c5fd" }]}>
                            {fmtNum(entry.protein_g ?? 0)}
                          </Text>
                          <Text style={[styles.entryPfc, { color: "#fde047" }]}>
                            {fmtNum(entry.fat_g ?? 0)}
                          </Text>
                          <Text style={[styles.entryPfc, { color: "#6ee7b7" }]}>
                            {fmtNum(entry.carbs_g ?? 0)}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={[styles.card, { marginBottom: 24 }]}>
          <Text style={styles.cardTitle}>よく食べたアイテム Top10（回数）</Text>
          {insight.top10.length === 0 ? (
            <Text style={styles.mutedSmall}>該当期間の記録がありません。</Text>
          ) : (
            insight.top10.map((item, idx) => (
              <View key={item.key} style={styles.topRow}>
                <Text style={styles.topLabel} numberOfLines={2}>
                  {idx + 1}. {item.label}
                </Text>
                <Text style={styles.topCount}>{item.count}回</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "700", flex: 1, minWidth: 0 },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.btnBg,
  },
  closeBtnText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  sub: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  outboxBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(120, 53, 15, 0.35)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.4)",
  },
  outboxIcon: { marginTop: 1 },
  outboxText: { color: "#fef3c7", fontSize: 12, lineHeight: 17, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 12 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.btnBg,
  },
  presetBtnOn: { backgroundColor: COLORS.accent },
  presetBtnText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  presetBtnTextOn: { color: "#fff" },
  presetSpacer: { flex: 1, minWidth: 4 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.btnBg,
  },
  shareBtnText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  hint: { color: COLORS.muted, fontSize: 10, marginTop: 8 },
  mealFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  },
  mealFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.btnBg,
  },
  mealFilterBtnOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  mealFilterBtnText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  mealFilterBtnTextOn: { color: "#fff" },
  errSmall: { color: COLORS.err, fontSize: 11, marginTop: 6 },
  dateRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "flex-end" },
  dateField: { flex: 1, minWidth: 0 },
  dateLabel: { color: COLORS.muted, fontSize: 10, marginBottom: 4 },
  dateInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 12,
    backgroundColor: "#030712",
  },
  applyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.btnBg,
    marginBottom: 1,
  },
  applyBtnText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  loadingText: { color: COLORS.muted, fontSize: 12 },
  err: { color: COLORS.err, fontSize: 12, marginTop: 8 },
  avgGrid: { flexDirection: "row", gap: 8 },
  avgCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "rgba(3,7,18,0.5)",
  },
  avgCap: { color: COLORS.muted, fontSize: 10, marginBottom: 4 },
  avgVal: { fontSize: 14, fontWeight: "700" },
  avgPct: { fontSize: 10, marginTop: 2, color: COLORS.muted },
  ratioBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: COLORS.border,
    marginTop: 10,
  },
  ratioSeg: { height: "100%" },
  dayBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "rgba(3,7,18,0.45)",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dayHeaderMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  dayTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  dayPfcRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  dayPfc: { fontSize: 12, width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
  dayCount: { color: COLORS.muted, fontSize: 11 },
  dayBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  entryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  entryHdr: { color: COLORS.muted, fontSize: 10, flex: 1 },
  entryHdrNum: { flex: 0, width: 44, textAlign: "right" },
  entryHdrPfc: { flex: 0, width: 36, textAlign: "center" },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  entryName: { color: COLORS.text, fontSize: 12, flex: 1, minWidth: 0, paddingRight: 6 },
  mealTag: { color: COLORS.muted },
  entryG: {
    width: 44,
    textAlign: "right",
    color: COLORS.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  entryPfc: {
    width: 36,
    textAlign: "center",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  muted: { color: COLORS.muted, fontSize: 14 },
  mutedSmall: { color: COLORS.muted, fontSize: 12 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: "rgba(3,7,18,0.45)",
  },
  topLabel: { color: COLORS.text, fontSize: 13, flex: 1, paddingRight: 8 },
  topCount: { color: COLORS.muted, fontSize: 13 },
});
