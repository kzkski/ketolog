import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Web `reorderRestaurants`（`src/app/today/actions/restaurant.ts`）と同じ Supabase 更新。
 */
export async function reorderRestaurantsMobile(
  supabase: SupabaseClient,
  userId: string,
  orderedRestaurantIds: string[]
): Promise<{ error: string | null }> {
  if (orderedRestaurantIds.length === 0) return { error: null };

  const { data: rows, error: fetchErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", userId)
    .in("id", orderedRestaurantIds);

  if (fetchErr) return { error: fetchErr.message };
  if (!rows || rows.length !== orderedRestaurantIds.length) {
    return { error: "お店の指定が不正です" };
  }

  const updates = orderedRestaurantIds.map((id, index) =>
    supabase
      .from("restaurants")
      .update({ display_order: index })
      .eq("id", id)
      .eq("user_id", userId)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (!failed.error.message.includes("display_order")) {
      return { error: failed.error.message };
    }

    const base = orderedRestaurantIds.length;
    const fallbackUpdates = orderedRestaurantIds.map((id, index) =>
      supabase
        .from("restaurants")
        .update({ order_count: base - index })
        .eq("id", id)
        .eq("user_id", userId)
    );
    const fallbackResults = await Promise.all(fallbackUpdates);
    const fallbackFailed = fallbackResults.find((r) => r.error);
    if (fallbackFailed?.error) return { error: fallbackFailed.error.message };
  }
  return { error: null };
}
