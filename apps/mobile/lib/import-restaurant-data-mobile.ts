import type { ImportData } from "@ketolog/domain/restaurant-import";
import type { MenuShareImportItem } from "@ketolog/domain/menu-share-qr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { nextRestaurantDisplayOrder } from "./add-restaurant-mobile";
import { ensureFavoriteEntryForMenuItem } from "./favorite-mutations";

/** Web `importRestaurantData`（`src/app/today/actions/import-export.ts`）と同一のクライアント実装 */
export async function importRestaurantDataMobile(
  supabase: SupabaseClient,
  userId: string,
  data: ImportData
): Promise<{
  added: number;
  skipped: string[];
  newRestaurants: { id: string; name: string; category: string }[];
  error: string | null;
}> {
  const { data: existing } = await supabase
    .from("restaurants")
    .select("name")
    .eq("user_id", userId);
  const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name));

  const skipped: string[] = [];
  const newRestaurants: { id: string; name: string; category: string }[] = [];

  for (const r of data.restaurants) {
    if (existingNames.has(r.name)) {
      skipped.push(r.name);
      continue;
    }

    const displayOrder = await nextRestaurantDisplayOrder(supabase, userId);
    let { data: newR, error: rErr } = await supabase
      .from("restaurants")
      .insert({
        user_id: userId,
        name: r.name,
        category: r.category,
        display_order: displayOrder,
      })
      .select("id, name, category")
      .single();

    if (rErr && rErr.message.includes("display_order")) {
      const fallback = await supabase
        .from("restaurants")
        .insert({ user_id: userId, name: r.name, category: r.category })
        .select("id, name, category")
        .single();
      newR = fallback.data;
      rErr = fallback.error;
    }
    if (rErr || !newR) {
      skipped.push(r.name);
      continue;
    }
    newRestaurants.push(newR as { id: string; name: string; category: string });

    if (r.menuItems.length > 0) {
      const groupOrderMap = new Map<string, number>();
      const { data: items, error: itemsErr } = await supabase
        .from("menu_items")
        .insert(
          r.menuItems.map(({ group, shared_barcode, standard_food_code, is_favorite, ...item }: MenuShareImportItem) => {
            void is_favorite;
            const g = group ?? null;
            if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
            return {
              user_id: userId,
              restaurant_id: newR.id,
              ...item,
              shared_barcode: shared_barcode ?? null,
              standard_food_code: standard_food_code ?? null,
              group_name: g,
              group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
            };
          })
        )
        .select();

      if (itemsErr) {
        return {
          added: newRestaurants.length,
          skipped,
          newRestaurants,
          error: itemsErr.message,
        };
      }

      if (items) {
        const rname = newR.name as string;
        for (let i = 0; i < r.menuItems.length; i++) {
          if (r.menuItems[i].is_favorite === true && items[i]) {
            const fe = await ensureFavoriteEntryForMenuItem(
              supabase,
              userId,
              (items[i] as { id: string }).id,
              rname
            );
            if (fe.error) {
              return {
                added: newRestaurants.length,
                skipped,
                newRestaurants,
                error: fe.error,
              };
            }
          }
        }
      }
    }
  }

  return { added: newRestaurants.length, skipped, newRestaurants, error: null };
}
