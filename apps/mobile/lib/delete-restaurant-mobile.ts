import type { SupabaseClient } from "@supabase/supabase-js";

import { SNAPSHOT_RESTAURANT_NAME } from "./snapshot-restaurant";

/** Web `deleteRestaurant`（`src/app/today/actions/restaurant.ts`）と同一のクライアント実装 */
export async function deleteRestaurantMobile(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<{ error: string | null }> {
  const { data: target } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (target?.name === SNAPSHOT_RESTAURANT_NAME) {
    return { error: "このお店は削除できません" };
  }

  const { error } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", restaurantId)
    .eq("user_id", userId);

  if (error) return { error: error.message };
  return { error: null };
}
