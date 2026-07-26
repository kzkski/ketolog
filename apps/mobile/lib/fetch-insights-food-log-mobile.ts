import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InsightFoodLogEntry,
  InsightPfcTargetSnapshot,
} from "@ketolog/domain/insights";
import type { MealType } from "@ketolog/types";

const INSIGHTS_PAGE_SIZE = 1000;

export async function fetchInsightsFoodLogForDateRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string,
  mealTypes?: MealType[]
): Promise<{ entries: InsightFoodLogEntry[]; error: string | null }> {
  const entries: InsightFoodLogEntry[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("food_log")
      .select(
        "id, date, meal_type, eaten_at, item_name, grams, protein_g, fat_g, carbs_g, source, menu_item_id, created_at"
      )
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("eaten_at", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + INSIGHTS_PAGE_SIZE - 1);
    if (mealTypes && mealTypes.length > 0) {
      query = query.in("meal_type", mealTypes);
    }
    const { data, error } = await query;

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

export async function fetchInsightsPfcTargetSnapshotsForDateRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string
): Promise<{ snapshots: InsightPfcTargetSnapshot[]; error: string | null }> {
  const { data, error } = await supabase
    .from("daily_pfc_target_snapshot")
    .select(
      "date, diet_phase, phase_name, protein_target_g, fat_target_g, carbs_target_g"
    )
    .eq("user_id", userId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) return { snapshots: [], error: error.message };

  const snapshots: InsightPfcTargetSnapshot[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      date: String(r.date),
      diet_phase: Number(r.diet_phase),
      phase_name: r.phase_name == null ? null : String(r.phase_name),
      protein_target_g: Number(r.protein_target_g),
      fat_target_g: Number(r.fat_target_g),
      carbs_target_g: Number(r.carbs_target_g),
    };
  });

  return { snapshots, error: null };
}
