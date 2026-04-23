import type { SupabaseClient } from "@supabase/supabase-js";

/** Web `FavoriteEntryPayload` / `MenuItem` のモバイル用サブセット */
export type FavoriteMenuItemPayload = {
  id: string;
  restaurant_id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  order_count: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
  group_order: number;
  shared_barcode: string | null;
  standard_food_code?: string | null;
  created_at?: string;
};

export type FavoriteEntryPayload = {
  id: string;
  favorite_group_id: string;
  menu_item_id: string;
  display_order: number;
  menu_item?: FavoriteMenuItemPayload;
};

export type FavoriteGroupPayload = {
  id: string;
  name: string;
  display_order: number;
  entries: FavoriteEntryPayload[];
};

const FAVORITE_MENU_ITEM_SELECT_WITH_STANDARD_FOOD_CODE =
  "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, order_count, rank, notes, group_name, group_order, shared_barcode, standard_food_code, created_at";
const FAVORITE_MENU_ITEM_SELECT_LEGACY =
  "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, order_count, rank, notes, group_name, group_order, shared_barcode, created_at";

function isMissingColumnError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

async function fetchFavoriteGroupsPayloadInternal(
  supabase: SupabaseClient,
  userId: string,
  includeStandardFoodCode: boolean
): Promise<{ data: FavoriteGroupPayload[]; error: string | null }> {
  const nestedMenuItemSelect = includeStandardFoodCode
    ? FAVORITE_MENU_ITEM_SELECT_WITH_STANDARD_FOOD_CODE
    : FAVORITE_MENU_ITEM_SELECT_LEGACY;
  const { data: rows, error } = await supabase
    .from("favorite_groups")
    .select(
      `
      id,
      name,
      display_order,
      favorite_entries (
        id,
        favorite_group_id,
        menu_item_id,
        display_order,
        menu_item:menu_items (
          ${nestedMenuItemSelect}
        )
      )
    `
    )
    .eq("user_id", userId)
    .order("display_order", { ascending: true });

  if (error) return { data: [], error: error.message };

  const groups: FavoriteGroupPayload[] = (rows ?? []).map((g: Record<string, unknown>) => {
    const rawEntries =
      (g.favorite_entries as Array<Record<string, unknown>> | null) ?? [];
    const entries: FavoriteEntryPayload[] = rawEntries
      .map((e) => {
        const rawMenuItem = e.menu_item as Record<string, unknown> | null | undefined;
        return {
          id: e.id as string,
          favorite_group_id: e.favorite_group_id as string,
          menu_item_id: e.menu_item_id as string,
          display_order: e.display_order as number,
          menu_item:
            rawMenuItem && typeof rawMenuItem.id === "string"
              ? (rawMenuItem as unknown as FavoriteMenuItemPayload)
              : undefined,
        };
      })
      .sort((a, b) => a.display_order - b.display_order);
    return {
      id: g.id as string,
      name: g.name as string,
      display_order: g.display_order as number,
      entries,
    };
  });

  return { data: groups, error: null };
}

/** Web `fetchFavoriteGroupsPayload` と同じネスト SELECT（RLS 下のクライアント用） */
export async function fetchFavoriteGroupsPayload(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: FavoriteGroupPayload[]; error: string | null }> {
  const primary = await fetchFavoriteGroupsPayloadInternal(supabase, userId, true);
  if (!isMissingColumnError(primary.error ? { message: primary.error } : null)) return primary;
  return fetchFavoriteGroupsPayloadInternal(supabase, userId, false);
}

/** メニュー行の ☆ 表示用（軽量・2クエリ） */
export async function fetchFavoritedMenuItemIds(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: Set<string>; error: string | null }> {
  const { data: groups, error } = await supabase
    .from("favorite_groups")
    .select("id")
    .eq("user_id", userId);
  if (error) return { data: new Set(), error: error.message };
  const groupIds = (groups ?? []).map((g) => g.id as string).filter(Boolean);
  if (groupIds.length === 0) return { data: new Set(), error: null };
  const { data: entries, error: e2 } = await supabase
    .from("favorite_entries")
    .select("menu_item_id")
    .in("favorite_group_id", groupIds);
  if (e2) return { data: new Set(), error: e2.message };
  const out = new Set<string>();
  for (const row of entries ?? []) {
    const id = (row as { menu_item_id?: string }).menu_item_id;
    if (id) out.add(String(id));
  }
  return { data: out, error: null };
}
