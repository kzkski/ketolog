"use server";

import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { addDaysJst } from "@/lib/insights";
import type { InsightFoodLogEntry, InsightPfcTargetSnapshot } from "@/lib/insights";
import type {
  BodyCompRow,
  DasRow,
  TrainingBurnRow,
} from "@ketolog/domain/energy-availability";
import type { MealType } from "@ketolog/types";

const INSIGHTS_PAGE_SIZE = 1000;

export async function getInsightsFoodLogForDateRange(
  start: string,
  end: string,
  mealTypes?: MealType[]
): Promise<{ entries: InsightFoodLogEntry[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { entries: [], error: "認証が必要です" };

  const entries: InsightFoodLogEntry[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
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

export async function getInsightsPfcTargetSnapshotsForDateRange(
  start: string,
  end: string
): Promise<{ snapshots: InsightPfcTargetSnapshot[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { snapshots: [], error: "認証が必要です" };

  const { data, error } = await supabase
    .from("daily_pfc_target_snapshot")
    .select(
      "date, diet_phase, phase_name, protein_target_g, fat_target_g, carbs_target_g"
    )
    .eq("user_id", user.id)
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

export async function getInsightsDasForDateRange(
  start: string,
  end: string
): Promise<{ rows: DasRow[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { rows: [], error: "認証が必要です" };

  // DAS.date は格納日 = 活動日 D+1
  const storageStart = addDaysJst(start, 1);
  const storageEnd = addDaysJst(end, 1);

  const { data, error } = await supabase
    .from("daily_activity_summary")
    .select("date, basal_calories_kcal, active_calories_kcal")
    .eq("user_id", user.id)
    .gte("date", storageStart)
    .lte("date", storageEnd)
    .order("date", { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows: DasRow[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      date: String(r.date),
      basal_calories_kcal:
        r.basal_calories_kcal == null ? null : Number(r.basal_calories_kcal),
      active_calories_kcal:
        r.active_calories_kcal == null ? null : Number(r.active_calories_kcal),
    };
  });

  return { rows, error: null };
}

export async function getInsightsTrainingBurnForDateRange(
  start: string,
  end: string
): Promise<{ rows: TrainingBurnRow[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { rows: [], error: "認証が必要です" };

  const { data, error } = await supabase
    .from("training_log")
    .select("date, calories_burned")
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows: TrainingBurnRow[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      date: String(r.date),
      calories_burned:
        r.calories_burned == null ? null : Number(r.calories_burned),
    };
  });

  return { rows, error: null };
}

export async function getInsightsBodyCompForDateRange(
  start: string,
  end: string
): Promise<{ rows: BodyCompRow[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { rows: [], error: "認証が必要です" };

  const { data, error } = await supabase
    .from("body_composition_sample")
    .select("date, measured_at, weight_kg, body_fat_pct")
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end)
    .order("measured_at", { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows: BodyCompRow[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      date: String(r.date),
      measured_at: String(r.measured_at),
      weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
      body_fat_pct: r.body_fat_pct == null ? null : Number(r.body_fat_pct),
    };
  });

  return { rows, error: null };
}
