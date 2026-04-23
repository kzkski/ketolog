import type { SupabaseClient } from "@supabase/supabase-js";

async function getOrCreateFavoriteGroupByName(
  supabase: SupabaseClient,
  userId: string,
  groupName: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = groupName.trim();
  if (!trimmed) return { id: null, error: "グループ名が空です" };

  const { data: existing } = await supabase
    .from("favorite_groups")
    .select("id")
    .eq("user_id", userId)
    .eq("name", trimmed)
    .maybeSingle();
  if (existing?.id) return { id: String(existing.id), error: null };

  const { data: maxRow } = await supabase
    .from("favorite_groups")
    .select("display_order")
    .eq("user_id", userId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = (maxRow?.display_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("favorite_groups")
    .insert({ user_id: userId, name: trimmed, display_order: displayOrder })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: inserted?.id ? String(inserted.id) : null, error: null };
}

/** Web `ensureFavoriteEntryForMenuItem` と同じ */
export async function ensureFavoriteEntryForMenuItem(
  supabase: SupabaseClient,
  userId: string,
  menuItemId: string,
  restaurantDisplayName: string
): Promise<{ error: string | null }> {
  const { data: dup } = await supabase
    .from("favorite_entries")
    .select("id")
    .eq("menu_item_id", menuItemId)
    .maybeSingle();
  if (dup) return { error: null };

  const { id: groupId, error: gErr } = await getOrCreateFavoriteGroupByName(
    supabase,
    userId,
    restaurantDisplayName
  );
  if (gErr || !groupId) return { error: gErr ?? "お気に入りグループの作成に失敗しました" };

  const { data: maxE } = await supabase
    .from("favorite_entries")
    .select("display_order")
    .eq("favorite_group_id", groupId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const entryOrder = (maxE?.display_order ?? -1) + 1;

  const { error: insErr } = await supabase.from("favorite_entries").insert({
    favorite_group_id: groupId,
    menu_item_id: menuItemId,
    display_order: entryOrder,
  });
  if (insErr) return { error: insErr.message };
  return { error: null };
}

export async function addMenuItemToFavoritesMobile(
  supabase: SupabaseClient,
  userId: string,
  menuItemId: string
): Promise<{ error: string | null }> {
  const { data: mi, error: miErr } = await supabase
    .from("menu_items")
    .select("restaurant_id")
    .eq("id", menuItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (miErr || !mi) {
    return { error: miErr?.message ?? "メニューが見つかりません" };
  }

  const { data: rest, error: rErr } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", mi.restaurant_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (rErr || !rest) {
    return { error: rErr?.message ?? "お店が見つかりません" };
  }

  return ensureFavoriteEntryForMenuItem(
    supabase,
    userId,
    menuItemId,
    String(rest.name)
  );
}

export async function removeMenuItemFromFavoritesMobile(
  supabase: SupabaseClient,
  menuItemId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("favorite_entries").delete().eq("menu_item_id", menuItemId);
  if (error) return { error: error.message };
  return { error: null };
}
