"use server";

import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import type { MenuItem, Restaurant } from "@/types/database";
import type { MenuShareImportItem } from "@ketolog/domain/menu-share-qr";
import { ensureFavoriteEntryForMenuItem } from "./favorites";
import { nextRestaurantDisplayOrder } from "./restaurant";

export type ImportRestaurantItem = MenuShareImportItem;

export type ImportRestaurantEntry = {
  name: string;
  category: string;
  menuItems: ImportRestaurantItem[];
};

export type ImportData = {
  version: number;
  restaurants: ImportRestaurantEntry[];
};

export async function importRestaurantData(data: ImportData): Promise<{
  added: number;
  skipped: string[];
  newRestaurants: Restaurant[];
  newMenuItems: MenuItem[];
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { added: 0, skipped: [], newRestaurants: [], newMenuItems: [], error: "認証が必要です" };

  const { data: existing } = await supabase
    .from("restaurants")
    .select("name")
    .eq("user_id", user.id);
  const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name));

  const skipped: string[] = [];
  const newRestaurants: Restaurant[] = [];
  const newMenuItems: MenuItem[] = [];

  for (const r of data.restaurants) {
    if (existingNames.has(r.name)) { skipped.push(r.name); continue; }

    const displayOrder = await nextRestaurantDisplayOrder(supabase, user.id);
    let { data: newR, error: rErr } = await supabase
      .from("restaurants")
      .insert({ user_id: user.id, name: r.name, category: r.category, display_order: displayOrder })
      .select()
      .single();
    if (rErr && rErr.message.includes("display_order")) {
      const fallback = await supabase
        .from("restaurants")
        .insert({ user_id: user.id, name: r.name, category: r.category })
        .select()
        .single();
      newR = fallback.data;
      rErr = fallback.error;
    }
    if (rErr || !newR) { skipped.push(r.name); continue; }
    newRestaurants.push(newR as Restaurant);

    if (r.menuItems.length > 0) {
      const groupOrderMap = new Map<string, number>();
      const { data: items } = await supabase
        .from("menu_items")
        .insert(r.menuItems.map(({ group, shared_barcode, standard_food_code, is_favorite, ...item }) => {
          void is_favorite;
          const g = group ?? null;
          if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
          return {
            user_id: user.id,
            restaurant_id: newR.id,
            ...item,
            shared_barcode: shared_barcode ?? null,
            standard_food_code: standard_food_code ?? null,
            group_name: g,
            group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
          };
        }))
        .select();
      if (items) {
        newMenuItems.push(...(items as MenuItem[]));
        const rname = newR.name as string;
        for (let i = 0; i < r.menuItems.length; i++) {
          if (r.menuItems[i].is_favorite === true && items[i]) {
            const fe = await ensureFavoriteEntryForMenuItem(
              supabase,
              user.id,
              (items[i] as { id: string }).id,
              rname
            );
            if (fe.error) {
              return {
                added: newRestaurants.length,
                skipped,
                newRestaurants,
                newMenuItems,
                error: fe.error,
              };
            }
          }
        }
      }
    }
  }

  return { added: newRestaurants.length, skipped, newRestaurants, newMenuItems, error: null };
}

/** 既存店にメニュー行を一括 INSERT する（「メニューをJSONで追加」ドロワー専用）。メニュー共有QRはクライアントでフォームに転記するだけで、ここは通らない。 */
export async function importMenuItemsToRestaurant(
  restaurantId: string,
  items: ImportRestaurantItem[]
): Promise<{ newMenuItems: MenuItem[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { newMenuItems: [], error: "認証が必要です" };

  const groupOrderMap = new Map<string, number>();
  const { data, error } = await supabase
    .from("menu_items")
    .insert(items.map(({ group, shared_barcode, standard_food_code, is_favorite, ...item }) => {
      void is_favorite;
      const g = group ?? null;
      if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
      return {
        user_id: user.id,
        restaurant_id: restaurantId,
        ...item,
        shared_barcode: shared_barcode ?? null,
        standard_food_code: standard_food_code ?? null,
        group_name: g,
        group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
      };
    }))
    .select();

  if (error) return { newMenuItems: [], error: error.message };

  const { data: restRow } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();
  const rname = restRow?.name ?? "";

  const inserted = (data ?? []) as MenuItem[];
  for (let i = 0; i < items.length; i++) {
    if (items[i].is_favorite === true && inserted[i] && rname) {
      const fe = await ensureFavoriteEntryForMenuItem(supabase, user.id, inserted[i].id, rname);
      if (fe.error) return { newMenuItems: inserted, error: fe.error };
    }
  }

  return { newMenuItems: inserted, error: null };
}
