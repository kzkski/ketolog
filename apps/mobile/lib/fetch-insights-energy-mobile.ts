import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysJst } from "@ketolog/domain/date";
import type {
  BodyCompRow,
  DasRow,
  TrainingBurnRow,
} from "@ketolog/domain/energy-availability";

export async function fetchInsightsDasForDateRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string
): Promise<{ rows: DasRow[]; error: string | null }> {
  const storageStart = addDaysJst(start, 1);
  const storageEnd = addDaysJst(end, 1);

  const { data, error } = await supabase
    .from("daily_activity_summary")
    .select("date, basal_calories_kcal, active_calories_kcal")
    .eq("user_id", userId)
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

export async function fetchInsightsTrainingBurnForDateRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string
): Promise<{ rows: TrainingBurnRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("training_log")
    .select("date, calories_burned")
    .eq("user_id", userId)
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

export async function fetchInsightsBodyCompForDateRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string
): Promise<{ rows: BodyCompRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("body_composition_sample")
    .select("date, measured_at, weight_kg, body_fat_pct")
    .eq("user_id", userId)
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
