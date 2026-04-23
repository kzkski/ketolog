import type { MenuShareImportItem } from "@ketolog/domain/menu-share-qr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureFavoriteEntryForMenuItem } from "./favorite-mutations";

/** Web `importMenuItemsToRestaurant`（`src/app/today/actions/import-export.ts`）と同一のクライアント実装 */
export async function importMenuItemsToRestaurantMobile(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string,
  items: MenuShareImportItem[]
): Promise<{ error: string | null }> {
  const groupOrderMap = new Map<string, number>();
  const { data, error } = await supabase
    .from("menu_items")
    .insert(
      items.map(({ group, shared_barcode, standard_food_code, is_favorite, ...item }) => {
        void is_favorite;
        const g = group ?? null;
        if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
        return {
          user_id: userId,
          restaurant_id: restaurantId,
          ...item,
          shared_barcode: shared_barcode ?? null,
          standard_food_code: standard_food_code ?? null,
          group_name: g,
          group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
        };
      })
    )
    .select();

  if (error) return { error: error.message };

  const { data: restRow } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  const rname = restRow?.name ?? "";

  const inserted = data ?? [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].is_favorite === true && inserted[i] && rname) {
      const rowId = (inserted[i] as { id: string }).id;
      const fe = await ensureFavoriteEntryForMenuItem(supabase, userId, rowId, rname);
      if (fe.error) return { error: fe.error };
    }
  }
  return { error: null };
}
