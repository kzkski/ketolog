"use server";

import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import type { InsightFoodLogEntry } from "@/lib/insights";

const INSIGHTS_PAGE_SIZE = 1000;

export async function getInsightsFoodLogForDateRange(
  start: string,
  end: string
): Promise<{ entries: InsightFoodLogEntry[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { entries: [], error: "認証が必要です" };

  const entries: InsightFoodLogEntry[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("food_log")
      .select(
        "id, date, meal_type, eaten_at, item_name, grams, protein_g, fat_g, carbs_g, source, menu_item_id, created_at"
      )
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("eaten_at", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + INSIGHTS_PAGE_SIZE - 1);

    if (error) return { entries: [], error: error.message };

    const rows = data ?? [];
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      entries.push({
        id: String(r.id),
        date: String(r.date),
        meal_type: String(r.meal_type),
        eaten_at: String(r.eaten_at),
        item_name: String(r.item_name),
        grams: Number(r.grams),
        protein_g: r.protein_g == null ? null : Number(r.protein_g),
        fat_g: r.fat_g == null ? null : Number(r.fat_g),
        carbs_g: r.carbs_g == null ? null : Number(r.carbs_g),
        source: r.source == null ? null : String(r.source),
        menu_item_id: r.menu_item_id == null ? null : String(r.menu_item_id),
        created_at: String(r.created_at),
      });
    }

    if (rows.length < INSIGHTS_PAGE_SIZE) break;
    offset += INSIGHTS_PAGE_SIZE;
  }

  return { entries, error: null };
}
