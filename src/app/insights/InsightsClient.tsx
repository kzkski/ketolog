"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  addDaysJst,
  buildInsights,
  getPresetRange,
  type InsightFoodLogEntry,
} from "@/lib/insights";
import { getInsightsFoodLogForDateRange } from "./actions";
import { MEAL_LABELS, MEAL_TYPES } from "@/lib/constants/meal";
import type { MealType } from "@ketolog/types";

const InsightsChart = dynamic(() => import("./InsightsChart"), {
  ssr: false,
  loading: () => <p className="text-xs text-gray-400">グラフを読み込み中...</p>,
});

const CUSTOM_RANGE_MAX_DAYS = 90;

type Preset = "7d" | "30d" | "custom";
type MealFilter = MealType | "all";

function fmtNum(v: number): string {
  return v.toFixed(1);
}

function ratioStyle(total: number, part: number): { width: string } {
  if (total <= 0) return { width: "0%" };
  return { width: `${Math.max(0, Math.min(100, (part / total) * 100))}%` };
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

export default function InsightsClient({
  initialEntries,
  today,
}: {
  initialEntries: InsightFoodLogEntry[];
  today: string;
}) {
  const preset7 = getPresetRange(today, 7);
  const [preset, setPreset] = useState<Preset>("7d");
  const [start, setStart] = useState(preset7.start);
  const [end, setEnd] = useState(preset7.end);
  const [entries, setEntries] = useState(initialEntries);
  const [mealFilter, setMealFilter] = useState<MealFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const selectedMealTypes = useMemo(
    () => (mealFilter === "all" ? undefined : [mealFilter]),
    [mealFilter]
  );

  const insight = useMemo(
    () => buildInsights(entries, start, end, { mealTypes: selectedMealTypes }),
    [entries, start, end, selectedMealTypes]
  );
  const avgTotal = insight.summary.avgProtein + insight.summary.avgFat + insight.summary.avgCarbs;
  const avgProteinPct = avgTotal > 0 ? (insight.summary.avgProtein / avgTotal) * 100 : 0;
  const avgFatPct = avgTotal > 0 ? (insight.summary.avgFat / avgTotal) * 100 : 0;
  const avgCarbsPct = avgTotal > 0 ? (insight.summary.avgCarbs / avgTotal) * 100 : 0;

  async function loadRange(
    nextStart: string,
    nextEnd: string,
    nextPreset: Preset,
    nextMealFilter: MealFilter = mealFilter
  ) {
    setLoading(true);
    setError(null);
    const mealTypes = nextMealFilter === "all" ? undefined : [nextMealFilter];
    const result = await getInsightsFoodLogForDateRange(nextStart, nextEnd, mealTypes);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPreset(nextPreset);
    setStart(nextStart);
    setEnd(nextEnd);
    setMealFilter(nextMealFilter);
    setEntries(result.entries);
    setExpanded(new Set());
  }

  function toggleDate(date: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function validateCustomRange(nextStart: string, nextEnd: string): string | null {
    if (nextStart > nextEnd) return "開始日は終了日以前にしてください。";
    if (nextEnd > today) return "終了日は今日以前にしてください。";
    const maxEnd = addDaysJst(nextStart, CUSTOM_RANGE_MAX_DAYS - 1);
    if (nextEnd > maxEnd) return `カスタム期間は最大${CUSTOM_RANGE_MAX_DAYS}日です。`;
    return null;
  }

  function downloadPeriodJson() {
    const payload = {
      kind: "ketolog_insights_export",
      version: 1,
      period: { start, end, preset, mealTypes: selectedMealTypes ?? [...MEAL_TYPES] },
      exportedAt: new Date().toISOString(),
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ketolog-insights-${start}-${end}-${toIsoNow()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-dvh bg-gray-950 text-white pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h1 className="shrink-0 text-lg font-semibold leading-tight">分析</h1>
          <Link
            href="/today"
            className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-gray-800"
          >
            閉じる
          </Link>
        </div>

        <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/70 p-3 sm:space-y-3">
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible">
            <button
              type="button"
              onClick={() => {
                const range = getPresetRange(today, 7);
                void loadRange(range.start, range.end, "7d");
              }}
              disabled={loading}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                preset === "7d" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
            >
              過去7日
            </button>
            <button
              type="button"
              onClick={() => {
                const range = getPresetRange(today, 30);
                void loadRange(range.start, range.end, "30d");
              }}
              disabled={loading}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                preset === "30d" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
            >
              過去30日
            </button>
            <span className="max-w-[5.5rem] shrink-0 self-center text-[10px] leading-snug text-gray-500 sm:max-w-none sm:rounded-lg sm:border sm:border-gray-800 sm:bg-gray-950/70 sm:px-2 sm:py-2 sm:text-center sm:text-xs">
              カスタム最大90日
            </span>
            <button
              type="button"
              onClick={downloadPeriodJson}
              className="shrink-0 rounded-lg bg-gray-700 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-600 sm:px-3 sm:py-2 sm:text-sm"
            >
              DL
            </button>
          </div>
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={() => void loadRange(start, end, preset, "all")}
              disabled={loading}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                mealFilter === "all"
                  ? "border-emerald-500 bg-emerald-600 text-white"
                  : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
            >
              すべて
            </button>
            {MEAL_TYPES.map((mealType) => (
              <button
                key={mealType}
                type="button"
                onClick={() => void loadRange(start, end, preset, mealType)}
                disabled={loading}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                  mealFilter === mealType
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                }`}
              >
                {MEAL_LABELS[mealType]}
              </button>
            ))}
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <label className="min-w-0 text-[10px] text-gray-300 sm:text-xs">
              開始日
              <input
                type="date"
                max={today}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-0.5 block w-full min-w-0 max-w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-xs sm:px-2 sm:text-sm"
              />
            </label>
            <label className="min-w-0 text-[10px] text-gray-300 sm:text-xs">
              終了日
              <input
                type="date"
                max={today}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-0.5 block w-full min-w-0 max-w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-xs sm:px-2 sm:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const v = validateCustomRange(start, end);
                if (v) {
                  setError(v);
                  return;
                }
                void loadRange(start, end, "custom");
              }}
              disabled={loading}
              className="shrink-0 rounded-lg bg-gray-700 px-2.5 py-1.5 text-xs hover:bg-gray-600 sm:py-2 sm:text-sm"
            >
              適用
            </button>
          </div>
          {loading && <p className="text-xs text-gray-400">読み込み中...</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
          <h2 className="mb-2 text-sm font-medium text-white">平均PFCバランス</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 py-2">
              <p className="text-[11px] text-gray-400">たんぱく質 (P)</p>
              <p className="text-sm font-semibold text-blue-300">{fmtNum(insight.summary.avgProtein)} g</p>
              <p className="text-[11px] text-blue-200/90">{fmtNum(avgProteinPct)}%</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 py-2">
              <p className="text-[11px] text-gray-400">脂質 (F)</p>
              <p className="text-sm font-semibold text-yellow-300">{fmtNum(insight.summary.avgFat)} g</p>
              <p className="text-[11px] text-yellow-200/90">{fmtNum(avgFatPct)}%</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 py-2">
              <p className="text-[11px] text-gray-400">糖質 (C)</p>
              <p className="text-sm font-semibold text-emerald-300">{fmtNum(insight.summary.avgCarbs)} g</p>
              <p className="text-[11px] text-emerald-200/90">{fmtNum(avgCarbsPct)}%</p>
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-800">
            <div className="flex h-full w-full">
              <div className="bg-blue-400" style={ratioStyle(avgTotal, insight.summary.avgProtein)} />
              <div className="bg-yellow-400" style={ratioStyle(avgTotal, insight.summary.avgFat)} />
              <div className="bg-emerald-400" style={ratioStyle(avgTotal, insight.summary.avgCarbs)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
          <h2 className="mb-2 text-sm font-medium text-white">日次PFC推移</h2>
          <InsightsChart data={insight.chart} />
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-2">
          <h2 className="text-sm font-medium text-white">日ごとの食事一覧</h2>
          {insight.daily.map((day) => {
            const isOpen = expanded.has(day.date);
            const total = day.protein + day.fat + day.carbs;
            return (
              <div key={day.date} className="rounded-lg border border-gray-800 bg-gray-950/60">
                <button
                  type="button"
                  onClick={() => toggleDate(day.date)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_4.2rem_4.2rem_4.2rem] items-center gap-1 text-xs">
                      <p className="truncate text-sm text-white">
                        {isOpen ? "▼" : "▶"} {jstDateLabel(day.date)}
                      </p>
                      <span className="text-right text-blue-300">{fmtNum(day.protein)}</span>
                      <span className="text-right text-yellow-300">{fmtNum(day.fat)}</span>
                      <span className="text-right text-emerald-300">{fmtNum(day.carbs)}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-gray-800">
                      <div className="flex h-full w-full">
                        <div className="bg-blue-400" style={ratioStyle(total, day.protein)} />
                        <div className="bg-yellow-400" style={ratioStyle(total, day.fat)} />
                        <div className="bg-emerald-400" style={ratioStyle(total, day.carbs)} />
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">{day.entries.length} 件</span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-800 px-3 py-2 space-y-1.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.2rem_4.2rem_4.2rem] gap-1 text-[11px] text-gray-500">
                      <span>項目</span>
                      <span className="text-right">g</span>
                      <span className="text-center text-blue-400">P</span>
                      <span className="text-center text-yellow-400">F</span>
                      <span className="text-center text-emerald-400">C</span>
                    </div>
                    {day.entries.length === 0 ? (
                      <p className="text-xs text-gray-500">記録なし</p>
                    ) : (
                      day.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.2rem_4.2rem_4.2rem] gap-1 rounded border border-gray-800 bg-gray-900/70 px-2 py-1.5 text-[12px]"
                        >
                          <div className="min-w-0 text-white">
                            <p className="truncate">
                              <span className="text-gray-400">
                                [{MEAL_LABELS[entry.meal_type as MealType] ?? entry.meal_type}]
                              </span>{" "}
                              {entry.item_name}
                            </p>
                          </div>
                          <span className="text-right text-gray-300">{fmtNum(entry.grams)}</span>
                          <span className="text-center text-blue-300">{fmtNum(entry.protein_g ?? 0)}</span>
                          <span className="text-center text-yellow-300">{fmtNum(entry.fat_g ?? 0)}</span>
                          <span className="text-center text-emerald-300">{fmtNum(entry.carbs_g ?? 0)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
          <h2 className="mb-2 text-sm font-medium text-white">よく食べたアイテム Top10（回数）</h2>
          {insight.top10.length === 0 ? (
            <p className="text-xs text-gray-500">該当期間の記録がありません。</p>
          ) : (
            <ol className="space-y-1">
              {insight.top10.map((item, idx) => (
                <li key={item.key} className="flex items-center justify-between rounded border border-gray-800 bg-gray-950/60 px-2 py-1.5 text-sm">
                  <span>{idx + 1}. {item.label}</span>
                  <span className="text-gray-300">{item.count}回</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
