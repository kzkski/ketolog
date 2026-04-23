import type { SupabaseClient } from "@supabase/supabase-js";
import { isSnapshotRestaurant } from "./snapshot-restaurant";

export type RestaurantRegisterOption = { id: string; name: string };

type Row = {
  id: string;
  name: string;
  order_count: number;
  display_order?: number | null;
  created_at: string | null;
};

function sortRestaurants(list: Row[]): Row[] {
  return [...list].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    if (b.order_count !== a.order_count) return b.order_count - a.order_count;
    return a.name.localeCompare(b.name, "ja");
  });
}

/**
 * メニュー登録先の候補（スナップショット店を除く）。
 * `TodayMenuPanel` の店舗取得と同じ `display_order` フォールバック。
 */
export async function fetchRestaurantsExcludingSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<{ restaurants: RestaurantRegisterOption[]; error: string | null }> {
  let data: unknown[] | null = null;
  const primary = await supabase
    .from("restaurants")
    .select("id, name, order_count, display_order, created_at")
    .eq("user_id", userId);
  if (primary.error) {
    const missingDisplayOrder =
      primary.error.message.toLowerCase().includes("display_order") &&
      primary.error.message.toLowerCase().includes("does not exist");
    if (!missingDisplayOrder) {
      return { restaurants: [], error: primary.error.message };
    }
    const fallback = await supabase
      .from("restaurants")
      .select("id, name, order_count, created_at")
      .eq("user_id", userId);
    if (fallback.error) {
      return { restaurants: [], error: fallback.error.message };
    }
    data = fallback.data as unknown[] | null;
  } else {
    data = primary.data as unknown[] | null;
  }

  const rows = sortRestaurants(((data ?? []) as Row[]).filter((r) => !isSnapshotRestaurant(r)));
  return {
    restaurants: rows.map((r) => ({ id: r.id, name: r.name })),
    error: null,
  };
}
