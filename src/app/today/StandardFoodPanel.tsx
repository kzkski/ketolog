"use client";

import { useEffect, useId, useState } from "react";
import type { Restaurant } from "@/types/database";
import {
  STANDARD_FOOD_GROUP_OPTIONS,
  STANDARD_FOOD_TAB_TITLE,
} from "@/lib/standard-food-groups";
import { STANDARD_FOOD_SEARCH_PAGE_SIZE } from "@/lib/standard-food-search";
import { searchStandardFoods, type StandardFoodSearchRow } from "./actions";

function fmtMacro(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

function StandardFoodPaginationBar({
  page,
  visibleCount,
  hasMore,
  onPrev,
  onNext,
}: {
  page: number;
  visibleCount: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = page * STANDARD_FOOD_SEARCH_PAGE_SIZE + 1;
  const end = page * STANDARD_FOOD_SEARCH_PAGE_SIZE + visibleCount;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
      <span className="tabular-nums">
        {start}〜{end} 件目
        {hasMore ? "（続きあり）" : ""}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={page === 0}
          onClick={onPrev}
          className="px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-200 disabled:opacity-40 disabled:pointer-events-none hover:border-gray-600"
        >
          前へ
        </button>
        <button
          type="button"
          disabled={!hasMore}
          onClick={onNext}
          className="px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-200 disabled:opacity-40 disabled:pointer-events-none hover:border-gray-600"
        >
          次へ
        </button>
      </div>
    </div>
  );
}

export function StandardFoodPanel({
  visibleRestaurants,
  compositionTargetRestaurantId,
  onCompositionTargetChange,
  onPickFood,
}: {
  visibleRestaurants: Restaurant[];
  compositionTargetRestaurantId: string;
  onCompositionTargetChange: (restaurantId: string) => void;
  onPickFood: (row: StandardFoodSearchRow) => void;
}) {
  const selectId = useId();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [rows, setRows] = useState<StandardFoodSearchRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        const result = await searchStandardFoods({
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
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [debouncedQuery, groupCode, page]);

  const hasMore = rows.length > STANDARD_FOOD_SEARCH_PAGE_SIZE;
  const visibleRows = hasMore ? rows.slice(0, STANDARD_FOOD_SEARCH_PAGE_SIZE) : rows;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-28">
      <div>
        <h2 className="text-base font-semibold text-white leading-snug" title={STANDARD_FOOD_TAB_TITLE}>
          文科省食品成分表
        </h2>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          糖質（C）は利用可能炭水化物（質量計・CHOAVL）です。総炭水化物より過大にならないよう、成分表の定義に合わせています。
        </p>
      </div>

      <div>
        <label htmlFor={selectId} className="sr-only">
          メニューに追加するお店
        </label>
        <div className="flex w-full max-w-md items-center gap-2">
          <select
            id={selectId}
            value={compositionTargetRestaurantId}
            onChange={(e) => onCompositionTargetChange(e.target.value)}
            className="min-w-0 flex-1 px-3 py-2 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {visibleRestaurants.length === 0 ? (
              <option value="">お店がありません</option>
            ) : (
              visibleRestaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))
            )}
          </select>
          <span className="shrink-0 text-[11px] sm:text-xs text-gray-400 leading-tight">
            に追加する
          </span>
        </div>
        {visibleRestaurants.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-300 leading-relaxed">
            追加先のお店がないため、食品の追加はできません。上の「＋」からお店を登録してください。
          </p>
        )}
      </div>

      <div>
        <p className="text-[10px] text-gray-500 mb-1 leading-tight">食品群で絞り込み（タップで切替・もう一度で解除）</p>
        <div className="flex flex-wrap gap-x-1 gap-y-1">
          {STANDARD_FOOD_GROUP_OPTIONS.map((g) => {
            const active = groupCode === g.code;
            return (
              <button
                key={g.code}
                type="button"
                onClick={() => {
                  setGroupCode(active ? null : g.code);
                  setPage(0);
                }}
                className={`rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium border transition-colors touch-manipulation ${
                  active
                    ? "border-emerald-500 bg-emerald-600/25 text-emerald-100"
                    : "border-gray-700 bg-gray-800/80 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                }`}
                title={g.label}
              >
                {g.code} {g.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">名称検索</label>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="例: ささみ、木綿豆腐"
          autoComplete="off"
          className="w-full px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500"
        />
        <p className="text-[11px] text-gray-600 mt-1">
          部分一致と類似（pg_trgm）を併用します。群のみ選択するとその群の一覧が出ます。
        </p>
      </div>

      {loading && <p className="text-xs text-gray-500">検索中…</p>}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      {!loading && !error && visibleRows.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-6">
          検索語を入れるか、食品群を選ぶと候補が表示されます。
        </p>
      )}

      {!loading && !error && visibleRows.length > 0 && (
        <StandardFoodPaginationBar
          page={page}
          visibleCount={visibleRows.length}
          hasMore={hasMore}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      <ul className="space-y-1.5">
        {visibleRows.map((row) => (
          <li key={row.food_code}>
            <button
              type="button"
              onClick={() => onPickFood(row)}
              disabled={!compositionTargetRestaurantId}
              className="w-full text-left rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 hover:border-gray-600 hover:bg-gray-800/50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-gray-100 leading-snug min-w-0 flex-1">
                  {row.name}
                </span>
                <span className="shrink-0 text-[10px] text-gray-500 tabular-nums">
                  {row.group_code}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                P{fmtMacro(row.protein_per_100g)} F{fmtMacro(row.fat_per_100g)} C
                {fmtMacro(row.carbs_per_100g)}
                <span className="text-gray-600 ml-1">（100gあたり）</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {!loading && !error && visibleRows.length > 0 && (
        <StandardFoodPaginationBar
          page={page}
          visibleCount={visibleRows.length}
          hasMore={hasMore}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed border-t border-gray-800/80 pt-3">
        出典: 文部科学省「日本食品標準成分表（八訂）増補2023」第2章（可食部100gあたり）。利用条件は同省の公開ページに従ってください。
      </p>
    </div>
  );
}
