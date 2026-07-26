import { addDaysJst, eachDate, toJstDateString } from "./date";
import { sumPfc } from "./pfc";
import type { MealType } from "@ketolog/types";

export { addDaysJst };

export type InsightFoodLogEntry = {
  id: string;
  date: string;
  meal_type: string;
  eaten_at: string;
  item_name: string;
  grams: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  source: string | null;
  menu_item_id: string | null;
  created_at: string;
};

export type DailyInsight = {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
  entries: InsightFoodLogEntry[];
};

export type TopItem = {
  key: string;
  label: string;
  count: number;
};

/** Insights 達成率用の日次目標（DB スナップショット） */
export type InsightPfcTargetSnapshot = {
  date: string;
  diet_phase: number;
  phase_name: string | null;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
};

export type DailyAchievement = {
  date: string;
  included: boolean;
  phaseName: string | null;
  dietPhase: number | null;
  proteinPct: number | null;
  fatPct: number | null;
  carbsPct: number | null;
};

export type AchievementSummary = {
  /** 記録日達成率の平均。記録日が0なら null */
  avgProteinPct: number | null;
  avgFatPct: number | null;
  avgCarbsPct: number | null;
  recordedDayCount: number;
  excludedDayCount: number;
  periodDayCount: number;
};

export function getTodayJstDate(): string {
  return toJstDateString();
}

export function getPresetRange(today: string, days: 7 | 30): { start: string; end: string } {
  return {
    start: addDaysJst(today, -(days - 1)),
    end: today,
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function toNum(v: number | null): number {
  return v ?? 0;
}

export function buildInsights(
  entries: InsightFoodLogEntry[],
  start: string,
  end: string,
  options?: { mealTypes?: MealType[] }
): {
  daily: DailyInsight[];
  summary: { avgProtein: number; avgFat: number; avgCarbs: number };
  top10: TopItem[];
  chart: Array<{ date: string; protein: number; fat: number; carbs: number }>;
} {
  const days = eachDate(start, end);
  const mealTypeSet =
    options?.mealTypes && options.mealTypes.length > 0 ? new Set(options.mealTypes) : null;
  const filteredEntries =
    mealTypeSet == null ? entries : entries.filter((entry) => mealTypeSet.has(entry.meal_type as MealType));
  const byDate = new Map<string, DailyInsight>();
  for (const day of days) {
    byDate.set(day, { date: day, protein: 0, fat: 0, carbs: 0, entries: [] });
  }

  for (const entry of filteredEntries) {
    const bucket = byDate.get(entry.date);
    if (!bucket) continue;
    const merged = sumPfc(
      { p: bucket.protein, f: bucket.fat, c: bucket.carbs },
      { p: toNum(entry.protein_g), f: toNum(entry.fat_g), c: toNum(entry.carbs_g) }
    );
    bucket.protein = merged.p;
    bucket.fat = merged.f;
    bucket.carbs = merged.c;
    bucket.entries.push(entry);
  }

  for (const day of byDate.values()) {
    day.entries.sort((a, b) => {
      const at = `${a.eaten_at ?? ""}|${a.created_at ?? ""}`;
      const bt = `${b.eaten_at ?? ""}|${b.created_at ?? ""}`;
      return at.localeCompare(bt);
    });
  }

  const dailyAsc = days.map((d) => byDate.get(d)!);
  const dailyDesc = [...dailyAsc].reverse();

  const dayCount = dailyAsc.length || 1;
  const periodTotals = dailyAsc.reduce(
    (acc, d) => sumPfc(acc, { p: d.protein, f: d.fat, c: d.carbs }),
    { p: 0, f: 0, c: 0 }
  );
  const sumProtein = periodTotals.p;
  const sumFat = periodTotals.f;
  const sumCarbs = periodTotals.c;

  const topMap = new Map<string, TopItem>();
  for (const entry of filteredEntries) {
    const key = entry.menu_item_id
      ? `menu:${entry.menu_item_id}`
      : `name:${normalizeName(entry.item_name)}`;
    const existing = topMap.get(key);
    if (!existing) {
      topMap.set(key, {
        key,
        label: entry.item_name.trim() || "(名前なし)",
        count: 1,
      });
      continue;
    }
    existing.count += 1;
  }

  const top10 = [...topMap.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"))
    .slice(0, 10);

  return {
    daily: dailyDesc,
    summary: {
      avgProtein: sumProtein / dayCount,
      avgFat: sumFat / dayCount,
      avgCarbs: sumCarbs / dayCount,
    },
    top10,
    chart: dailyAsc.map((d) => ({
      date: d.date,
      protein: d.protein,
      fat: d.fat,
      carbs: d.carbs,
    })),
  };
}

function achievementPct(consumed: number, target: number): number | null {
  if (!(target > 0) || !Number.isFinite(target) || !Number.isFinite(consumed)) return null;
  return (consumed / target) * 100;
}

/**
 * 記録日達成率: snapshot があり、かつその日の（フィルタ後）food_log が1件以上の日だけ平均に含める。
 * チャート欠損日は null（折れ線ギャップ）。
 */
export function buildAchievementRates(
  daily: DailyInsight[],
  snapshots: InsightPfcTargetSnapshot[],
  periodDayCount: number
): {
  summary: AchievementSummary;
  dailyAchievement: DailyAchievement[];
  chart: Array<{
    date: string;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
  }>;
} {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  // daily は新しい順のことがあるので日付昇順でチャートを組む
  const dailyAsc = [...daily].sort((a, b) => a.date.localeCompare(b.date));

  const dailyAchievement: DailyAchievement[] = dailyAsc.map((day) => {
    const snap = byDate.get(day.date);
    const hasEntries = day.entries.length > 0;
    if (!snap || !hasEntries) {
      return {
        date: day.date,
        included: false,
        phaseName: snap?.phase_name ?? null,
        dietPhase: snap?.diet_phase ?? null,
        proteinPct: null,
        fatPct: null,
        carbsPct: null,
      };
    }
    const proteinPct = achievementPct(day.protein, Number(snap.protein_target_g));
    const fatPct = achievementPct(day.fat, Number(snap.fat_target_g));
    const carbsPct = achievementPct(day.carbs, Number(snap.carbs_target_g));
    if (proteinPct == null || fatPct == null || carbsPct == null) {
      return {
        date: day.date,
        included: false,
        phaseName: snap.phase_name,
        dietPhase: snap.diet_phase,
        proteinPct: null,
        fatPct: null,
        carbsPct: null,
      };
    }
    return {
      date: day.date,
      included: true,
      phaseName: snap.phase_name,
      dietPhase: snap.diet_phase,
      proteinPct,
      fatPct,
      carbsPct,
    };
  });

  const included = dailyAchievement.filter((d) => d.included);
  const recordedDayCount = included.length;
  const avg = (pick: (d: DailyAchievement) => number | null): number | null => {
    if (recordedDayCount === 0) return null;
    let sum = 0;
    for (const d of included) sum += pick(d) ?? 0;
    return sum / recordedDayCount;
  };

  return {
    summary: {
      avgProteinPct: avg((d) => d.proteinPct),
      avgFatPct: avg((d) => d.fatPct),
      avgCarbsPct: avg((d) => d.carbsPct),
      recordedDayCount,
      excludedDayCount: Math.max(0, periodDayCount - recordedDayCount),
      periodDayCount,
    },
    dailyAchievement,
    chart: dailyAchievement.map((d) => ({
      date: d.date,
      protein: d.proteinPct,
      fat: d.fatPct,
      carbs: d.carbsPct,
    })),
  };
}
