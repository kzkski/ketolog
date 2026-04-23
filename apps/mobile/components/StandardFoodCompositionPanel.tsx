import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STANDARD_FOOD_GROUP_OPTIONS,
  STANDARD_FOOD_SEARCH_PAGE_SIZE,
  STANDARD_FOOD_TAB_TITLE,
} from "@ketolog/domain/standard-food-meta";

import {
  searchStandardFoodsMobile,
  type StandardFoodSearchRow,
} from "../lib/search-standard-foods-mobile";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
};

type Props = {
  supabase: SupabaseClient;
  /** 親（`TodayMenuPanel` 先頭の検索欄）と同期 */
  searchQuery: string;
  onPickFood: (row: StandardFoodSearchRow) => void;
};

function fmtMacro(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

export function StandardFoodCompositionPanel({
  supabase,
  searchQuery,
  onPickFood,
}: Props) {
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [rows, setRows] = useState<StandardFoodSearchRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 320);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, groupCode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const result = await searchStandardFoodsMobile(supabase, {
        query: debouncedQuery,
        groupCode,
        limit: STANDARD_FOOD_SEARCH_PAGE_SIZE + 1,
        offset: page * STANDARD_FOOD_SEARCH_PAGE_SIZE,
      });
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        setRows([]);
        return;
      }
      setError(null);
      setRows(result.rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, groupCode, page, supabase]);

  const hasMore = rows.length > STANDARD_FOOD_SEARCH_PAGE_SIZE;
  const visibleRows = hasMore ? rows.slice(0, STANDARD_FOOD_SEARCH_PAGE_SIZE) : rows;

  const onPickRow = useCallback(
    (row: StandardFoodSearchRow) => {
      onPickFood(row);
    },
    [onPickFood]
  );

  return (
    <View style={styles.outer}>
      <Text style={styles.title} numberOfLines={2}>
        {STANDARD_FOOD_TAB_TITLE}
      </Text>

      <View style={styles.field}>
        <Text style={styles.groupHint}>
          食品群で絞り込み（タップで切替・もう一度で解除）
        </Text>
        <View style={styles.groupWrap}>
          {STANDARD_FOOD_GROUP_OPTIONS.map((g) => {
            const on = groupCode === g.code;
            return (
              <Pressable
                key={g.code}
                onPress={() => {
                  setGroupCode(on ? null : g.code);
                  setPage(0);
                }}
                style={[styles.groupBtn, on && styles.groupBtnOn]}
              >
                <Text style={[styles.groupBtnText, on && styles.groupBtnTextOn]} numberOfLines={2}>
                  {g.code} {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Text style={styles.rangeText}>
        {visibleRows.length === 0
          ? "該当なし"
          : `${page * STANDARD_FOOD_SEARCH_PAGE_SIZE + 1}〜${
              page * STANDARD_FOOD_SEARCH_PAGE_SIZE + visibleRows.length
            } 件目${hasMore ? "（続きあり）" : ""}`}
      </Text>

      <View style={styles.list}>
        {visibleRows.map((row) => (
          <Pressable
            key={row.food_code}
            onPress={() => onPickRow(row)}
            style={styles.row}
          >
            <Text style={styles.rowName} numberOfLines={2}>
              {row.name}
            </Text>
            <Text style={styles.rowMeta}>
              P{fmtMacro(row.protein_per_100g)} F{fmtMacro(row.fat_per_100g)} C
              {fmtMacro(row.carbs_per_100g)}
            </Text>
            <Text style={styles.rowCode}>{row.food_code}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pager}>
        <Pressable
          onPress={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          style={[styles.pageBtn, page === 0 && styles.pageBtnOff]}
        >
          <Text style={styles.pageBtnText}>前へ</Text>
        </Pressable>
        <Pressable
          onPress={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          style={[styles.pageBtn, !hasMore && styles.pageBtnOff]}
        >
          <Text style={styles.pageBtnText}>次へ</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingBottom: 24 },
  title: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 10, lineHeight: 17 },
  field: { marginBottom: 12 },
  groupHint: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 4,
  },
  groupWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 4,
    columnGap: 4,
  },
  groupBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#1f2937",
  },
  groupBtnOn: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(16, 185, 129, 0.22)",
  },
  groupBtnText: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
  },
  groupBtnTextOn: { color: "#a7f3d0", fontWeight: "600" },
  err: { color: "#fecaca", fontSize: 13, marginBottom: 8 },
  rangeText: { color: COLORS.textMuted, fontSize: 11, marginBottom: 8 },
  list: { gap: 8 },
  row: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#0f172a",
  },
  rowName: { color: COLORS.text, fontSize: 15, fontWeight: "600", marginBottom: 4 },
  rowMeta: { color: COLORS.textMuted, fontSize: 12 },
  rowCode: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  pager: { flexDirection: "row", gap: 8, marginTop: 12, justifyContent: "flex-end" },
  pageBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
});
