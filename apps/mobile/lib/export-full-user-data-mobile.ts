import type { SupabaseClient } from "@supabase/supabase-js";

import { isSnapshotRestaurant } from "./snapshot-restaurant";

/** Web `FoodLogExportEntry` / `getFoodLogForExport` と同一フィールド */
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

const FOOD_LOG_EXPORT_PAGE_SIZE = 1000;

export type RestaurantExportRow = {
  id: string;
  name: string;
  category: string;
};

export type MenuItemExportRow = {
  restaurant_id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  shared_barcode: string | null;
  standard_food_code: string | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
};

/** Web `partitionForFullJsonExport` と同一 */
export function partitionForFullJsonExport(
  restaurants: RestaurantExportRow[],
  menuItems: MenuItemExportRow[]
) {
  const exportRestaurants = restaurants.filter((r) => !isSnapshotRestaurant(r));
  const ids = new Set(exportRestaurants.map((r) => r.id));
  const exportMenuItems = menuItems.filter((m) => ids.has(m.restaurant_id));
  return { exportRestaurants, exportMenuItems };
}

/** Web `buildFullDataExportPayload` と同一 */
export function buildFullDataExportPayload(
  restaurants: RestaurantExportRow[],
  menuItems: MenuItemExportRow[],
  foodLog: FoodLogExportEntry[]
) {
  const { exportRestaurants, exportMenuItems } = partitionForFullJsonExport(restaurants, menuItems);
  return {
    version: 2 as const,
    exportedAt: new Date().toISOString().split("T")[0],
    restaurants: exportRestaurants.map((r) => ({
      name: r.name,
      category: r.category,
      menuItems: exportMenuItems
        .filter((m) => m.restaurant_id === r.id)
        .map((m) => ({
          name: m.name,
          protein_per_100g: m.protein_per_100g,
          fat_per_100g: m.fat_per_100g,
          carbs_per_100g: m.carbs_per_100g,
          shared_barcode: m.shared_barcode ?? null,
          standard_food_code: m.standard_food_code ?? null,
          default_grams: m.default_grams,
          rank: m.rank,
          notes: m.notes,
          group: m.group_name,
        })),
    })),
    foodLog,
  };
}

/** Web `getFoodLogForExport` と同一のページング取得 */
export async function fetchFoodLogForExportMobile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ entries: FoodLogExportEntry[]; error: string | null }> {
  const entries: FoodLogExportEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("food_log")
      .select(
        "id, date, meal_type, eaten_at, item_name, grams, protein_g, fat_g, carbs_g, source, menu_item_id, created_at"
      )
      .eq("user_id", userId)
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
