"use server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import type {
  FavoriteEntryPayload,
  FavoriteGroupPayload,
} from "@/types/database";

async function fetchFavoriteGroupsPayloadInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ data: FavoriteGroupPayload[]; error: string | null }> {
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
        display_order
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
      .map((e) => ({
        id: e.id as string,
        favorite_group_id: e.favorite_group_id as string,
        menu_item_id: e.menu_item_id as string,
        display_order: e.display_order as number,
      }))
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

export async function fetchFavoriteGroupsPayload(): Promise<{
  data: FavoriteGroupPayload[];
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: [], error: "認証が必要です" };
  return fetchFavoriteGroupsPayloadInternal(supabase, user.id);
}

async function getOrCreateFavoriteGroupByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  if (existing?.id) return { id: existing.id, error: null };

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
  return { id: inserted.id as string, error: null };
}

/** お気に入りエントリを1件追加（既にあれば何もしない）。インポートからも利用。 */
export async function ensureFavoriteEntryForMenuItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export async function addMenuItemToFavorites(
  menuItemId: string
): Promise<{ data: FavoriteGroupPayload[] | null; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: mi, error: miErr } = await supabase
    .from("menu_items")
    .select("restaurant_id")
    .eq("id", menuItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (miErr || !mi) {
    return { data: null, error: miErr?.message ?? "メニューが見つかりません" };
  }

  const { data: rest, error: rErr } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", mi.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rErr || !rest) {
    return { data: null, error: rErr?.message ?? "お店が見つかりません" };
  }

  const addErr = await ensureFavoriteEntryForMenuItem(
    supabase,
    user.id,
    menuItemId,
    rest.name
  );
  if (addErr.error) return { data: null, error: addErr.error };

  const payload = await fetchFavoriteGroupsPayloadInternal(supabase, user.id);
  return { data: payload.data, error: payload.error };
}

export async function removeMenuItemFromFavorites(
  menuItemId: string
): Promise<{ data: FavoriteGroupPayload[] | null; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase.from("favorite_entries").delete().eq("menu_item_id", menuItemId);
  if (error) return { data: null, error: error.message };

  const payload = await fetchFavoriteGroupsPayloadInternal(supabase, user.id);
  return { data: payload.data, error: payload.error };
}
