import type { SupabaseClient } from "@supabase/supabase-js";

/** Web `resolveMenuItemGroupOrder` と同じ */
export async function resolveMenuItemGroupOrder(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string,
  groupName: string | null
): Promise<number> {
  if (!groupName) return 0;

  const { data: existing } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("group_name", groupName)
    .limit(1)
    .maybeSingle();

  if (existing && typeof existing.group_order === "number") {
    return existing.group_order;
  }

  const { data: maxRow } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .not("group_name", "is", null)
    .order("group_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (maxRow?.group_order ?? -1) + 1;
}
