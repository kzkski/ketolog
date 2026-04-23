import type { SupabaseClient } from "@supabase/supabase-js";

import { SNAPSHOT_RESTAURANT_NAME } from "./snapshot-restaurant";

/** Web `src/lib/restaurant-limits.ts` と同一 */
export const RESTAURANT_NAME_MAX_LENGTH = 100;

type RestaurantRow = Record<string, unknown>;

/**
 * Web `updateRestaurantName`（`src/app/today/actions/restaurant.ts`）と同じ処理。
 */
export async function updateRestaurantNameMobile(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string,
  rawName: string
): Promise<{
  data: RestaurantRow | null;
  updatedFavoriteGroupId: string | null;
  error: string | null;
}> {
  const name = rawName.trim();
  if (!name) {
    return { data: null, updatedFavoriteGroupId: null, error: "店名を入力してください" };
  }
  if (name.length > RESTAURANT_NAME_MAX_LENGTH) {
    return {
      data: null,
      updatedFavoriteGroupId: null,
      error: `店名は${RESTAURANT_NAME_MAX_LENGTH}文字以内にしてください`,
    };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    return { data: null, updatedFavoriteGroupId: null, error: fetchErr.message };
  }
  if (!row) {
    return { data: null, updatedFavoriteGroupId: null, error: "お店が見つかりません" };
  }

  const oldName = String((row as { name: string }).name);
  if (oldName === SNAPSHOT_RESTAURANT_NAME) {
    return { data: null, updatedFavoriteGroupId: null, error: "このお店の名前は変更できません" };
  }

  if (name === oldName) {
    const { data: full, error: fullErr } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .eq("user_id", userId)
      .single();
    if (fullErr || !full) {
      return {
        data: null,
        updatedFavoriteGroupId: null,
        error: fullErr?.message ?? "お店が見つかりません",
      };
    }
    return {
      data: full as RestaurantRow,
      updatedFavoriteGroupId: null,
      error: null,
    };
  }

  let groupToRenameId: string | null = null;

  const { data: fg } = await supabase
    .from("favorite_groups")
    .select("id")
    .eq("user_id", userId)
    .eq("name", oldName)
    .maybeSingle();

  if (fg?.id) {
    const { data: entries, error: entErr } = await supabase
      .from("favorite_entries")
      .select("menu_item_id")
      .eq("favorite_group_id", fg.id);

    if (entErr) {
      return { data: null, updatedFavoriteGroupId: null, error: entErr.message };
    }

    const ids = (entries ?? []).map((e) => (e as { menu_item_id: string }).menu_item_id);
    let allSameRestaurant = true;
    if (ids.length > 0) {
      const { data: items, error: miErr } = await supabase
        .from("menu_items")
        .select("restaurant_id")
        .eq("user_id", userId)
        .in("id", ids);
      if (miErr) {
        return { data: null, updatedFavoriteGroupId: null, error: miErr.message };
      }
      const miRows = items ?? [];
      if (miRows.length !== ids.length) {
        allSameRestaurant = false;
      } else {
        for (const it of miRows) {
          if ((it as { restaurant_id: string }).restaurant_id !== restaurantId) {
            allSameRestaurant = false;
            break;
          }
        }
      }
    }

    if (allSameRestaurant) {
      groupToRenameId = fg.id as string;

      const { data: conflict } = await supabase
        .from("favorite_groups")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .neq("id", fg.id)
        .maybeSingle();

      if (conflict?.id) {
        return {
          data: null,
          updatedFavoriteGroupId: null,
          error:
            "この名前はお気に入りの別グループで使われているため、店名に変更できません。",
        };
      }
    }
  }

  const restaurantUpdate = await supabase
    .from("restaurants")
    .update({ name })
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .select()
    .single();

  if (restaurantUpdate.error) {
    return {
      data: null,
      updatedFavoriteGroupId: null,
      error: restaurantUpdate.error.message,
    };
  }

  const updated = restaurantUpdate.data as RestaurantRow;

  if (groupToRenameId) {
    const fgUp = await supabase
      .from("favorite_groups")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", groupToRenameId)
      .eq("user_id", userId);

    if (fgUp.error) {
      await supabase
        .from("restaurants")
        .update({ name: oldName })
        .eq("id", restaurantId)
        .eq("user_id", userId);

      return {
        data: null,
        updatedFavoriteGroupId: null,
        error: fgUp.error.message,
      };
    }
  }

  return {
    data: updated,
    updatedFavoriteGroupId: groupToRenameId,
    error: null,
  };
}
