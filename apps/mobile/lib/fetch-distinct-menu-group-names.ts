import type { SupabaseClient } from "@supabase/supabase-js";

/** 店舗内の既存グループ名（メニュー行の候補）。Web `existingGroupNames` 相当。 */
export async function fetchDistinctMenuGroupNames(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<{ names: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("group_name")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .not("group_name", "is", null);

  if (error) return { names: [], error: error.message };

  const set = new Set<string>();
  for (const row of data ?? []) {
    const gn = (row as { group_name?: string | null }).group_name?.trim();
    if (gn) set.add(gn);
  }
  const names = [...set].sort((a, b) => a.localeCompare(b, "ja"));
  return { names, error: null };
}
