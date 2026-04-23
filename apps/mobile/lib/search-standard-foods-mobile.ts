import type { SupabaseClient } from "@supabase/supabase-js";
import { STANDARD_FOOD_SEARCH_PAGE_SIZE } from "@ketolog/domain/standard-food-meta";

export type StandardFoodSearchRow = {
  food_code: string;
  group_code: string;
  name: string;
  name_normalized: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  source_version: string;
  created_at: string;
};

export async function searchStandardFoodsMobile(
  supabase: SupabaseClient,
  input: {
    query: string;
    groupCode: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{ rows: StandardFoodSearchRow[]; error: string | null }> {
  const q = input.query
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const { data, error } = await supabase.rpc("search_standard_foods", {
    p_query: q,
    p_group_code: input.groupCode && input.groupCode.length > 0 ? input.groupCode : null,
    p_limit: input.limit ?? STANDARD_FOOD_SEARCH_PAGE_SIZE,
    p_offset: input.offset ?? 0,
  });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as StandardFoodSearchRow[], error: null };
}
