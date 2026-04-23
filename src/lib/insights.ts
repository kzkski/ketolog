import { addDaysJst, eachDate, toJstDateString } from "@ketolog/domain/date";
import { sumPfc } from "@ketolog/domain/pfc";
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
  end: string
): {
  daily: DailyInsight[];
  summary: { avgProtein: number; avgFat: number; avgCarbs: number };
  top10: TopItem[];
  chart: Array<{ date: string; protein: number; fat: number; carbs: number }>;
} {
  const days = eachDate(start, end);
  const byDate = new Map<string, DailyInsight>();
  for (const day of days) {
    byDate.set(day, { date: day, protein: 0, fat: 0, carbs: 0, entries: [] });
  }

  for (const entry of entries) {
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
  for (const entry of entries) {
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
