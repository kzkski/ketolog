"use server";

import { sumPfc } from "@ketolog/domain/pfc";
import type { PfcGrams } from "@ketolog/types";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import type { FoodLogEntry, TodayConsumed } from "@/types/database";

export type SaveItem = {
  menuItemId: string | null;
  name: string;
  totalGrams: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  restaurantId: string;
};

/** 全データ JSON 用。`user_id` は含めない。 */
export type FoodLogExportEntry = {
  id: string;
  date: string;
  meal_type: string;
  eaten_at: string;
  item_name: string;
  grams: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  source: string;
  menu_item_id: string | null;
  created_at: string;
};

/** PostgREST の `max_rows` 上限（ローカルは [api].max_rows=1000）。超過分は複数回取得する。 */
const FOOD_LOG_EXPORT_PAGE_SIZE = 1000;

export async function saveMealToLog(
  items: SaveItem[],
  mealType: string,
  date: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase.from("food_log").insert(
    items.map((item) => ({
      user_id: user.id,
      date,
      meal_type: mealType,
      item_name: item.name,
      grams: item.totalGrams,
      protein_g: item.proteinG,
      fat_g: item.fatG,
      carbs_g: item.carbsG,
      source: item.restaurantId,
      menu_item_id: item.menuItemId,
    }))
  );

  if (error) return { error: error.message };
  return { error: null };
}

export async function getFoodLogForDate(date: string): Promise<{
  entries: FoodLogEntry[];
  consumed: TodayConsumed;
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("food_log")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: error.message };

  const entries = (data ?? []) as FoodLogEntry[];
  const summed = entries.reduce<PfcGrams>(
    (acc, row) =>
      sumPfc(acc, {
        p: row.protein_g ?? 0,
        f: row.fat_g ?? 0,
        c: row.carbs_g ?? 0,
      }),
    { p: 0, f: 0, c: 0 }
  );
  const consumed: TodayConsumed = {
    protein: summed.p,
    fat: summed.f,
    carbs: summed.c,
  };
  return { entries, consumed, error: null };
}

export async function getFoodLogForExport(): Promise<{
  entries: FoodLogExportEntry[];
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { entries: [], error: "認証が必要です" };

  const entries: FoodLogExportEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("food_log")
      .select(
        "id, date, meal_type, eaten_at, item_name, grams, protein_g, fat_g, carbs_g, source, menu_item_id, created_at"
      )
      .eq("user_id", user.id)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + FOOD_LOG_EXPORT_PAGE_SIZE - 1);

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
        source: String(r.source),
        menu_item_id: r.menu_item_id == null ? null : String(r.menu_item_id),
        created_at: String(r.created_at),
      });
    }

    if (rows.length < FOOD_LOG_EXPORT_PAGE_SIZE) break;
    offset += FOOD_LOG_EXPORT_PAGE_SIZE;
  }

  return { entries, error: null };
}

export async function deleteFoodLogEntry(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("food_log")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateFoodLogEntry(
  id: string,
  newGrams: number,
  newMealType: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const { data: entry, error: fetchError } = await supabase
    .from("food_log")
    .select("grams, protein_g, fat_g, carbs_g")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !entry) return { error: fetchError?.message ?? "記録が見つかりません" };

  const oldGrams = entry.grams || 1;
  const pPer100 = (entry.protein_g ?? 0) * 100 / oldGrams;
  const fPer100 = (entry.fat_g ?? 0) * 100 / oldGrams;
  const cPer100 = (entry.carbs_g ?? 0) * 100 / oldGrams;

  const { error } = await supabase
    .from("food_log")
    .update({
      grams: newGrams,
      meal_type: newMealType,
      protein_g: pPer100 * newGrams / 100,
      fat_g: fPer100 * newGrams / 100,
      carbs_g: cPer100 * newGrams / 100,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}
