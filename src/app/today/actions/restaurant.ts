"use server";

import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { RESTAURANT_NAME_MAX_LENGTH } from "@/lib/restaurant-limits";
import { SNAPSHOT_RESTAURANT_NAME } from "@/lib/snapshot-restaurant";
import type { Restaurant } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

function isUniqueConstraintViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return typeof err.message === "string" && err.message.includes("duplicate key");
}

export async function nextRestaurantDisplayOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { data: row } = await supabase
    .from("restaurants")
    .select("display_order")
    .eq("user_id", userId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (row?.display_order ?? -1) + 1;
}

export async function addRestaurant(
  name: string,
  category: string
): Promise<{ data: Restaurant | null; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: null, error: "認証が必要です" };

  const displayOrder = await nextRestaurantDisplayOrder(supabase, user.id);

  const first = await supabase
    .from("restaurants")
    .insert({ user_id: user.id, name: name.trim(), category, display_order: displayOrder })
    .select()
    .single();
  if (first.error && first.error.message.includes("display_order")) {
    const fallback = await supabase
      .from("restaurants")
      .insert({ user_id: user.id, name: name.trim(), category })
      .select()
      .single();
    if (fallback.error) return { data: null, error: fallback.error.message };
    return { data: fallback.data as Restaurant, error: null };
  }

  if (first.error) return { data: null, error: first.error.message };
  return { data: first.data as Restaurant, error: null };
}

export async function reorderRestaurants(
  orderedRestaurantIds: string[]
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };
  if (orderedRestaurantIds.length === 0) return { error: null };

  const { data: rows, error: fetchErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", user.id)
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
      .eq("user_id", user.id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (!failed.error.message.includes("display_order")) {
      return { error: failed.error.message };
    }

    // 旧スキーマ互換: display_order が未適用の場合は order_count で順序を保存する
    const base = orderedRestaurantIds.length;
    const fallbackUpdates = orderedRestaurantIds.map((id, index) =>
      supabase
        .from("restaurants")
        .update({ order_count: base - index })
        .eq("id", id)
        .eq("user_id", user.id)
    );
    const fallbackResults = await Promise.all(fallbackUpdates);
    const fallbackFailed = fallbackResults.find((r) => r.error);
    if (fallbackFailed?.error) return { error: fallbackFailed.error.message };
  }
  return { error: null };
}

export async function getOrCreateSnapshotRestaurant(): Promise<{
  data: Restaurant | null;
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: existingRows, error: selectError } = await supabase
    .from("restaurants")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", SNAPSHOT_RESTAURANT_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) return { data: null, error: selectError.message };
  const existing = existingRows?.[0];
  if (existing) return { data: existing as Restaurant, error: null };

  const { data: maxRow } = await supabase
    .from("restaurants")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = (maxRow?.display_order ?? -1) + 1;

  const insertPrimary = await supabase
    .from("restaurants")
    .insert({
      user_id: user.id,
      name: SNAPSHOT_RESTAURANT_NAME,
      category: "other",
      display_order: displayOrder,
    })
    .select()
    .single();

  let inserted = insertPrimary;

  if (insertPrimary.error && insertPrimary.error.message.includes("display_order")) {
    inserted = await supabase
      .from("restaurants")
      .insert({
        user_id: user.id,
        name: SNAPSHOT_RESTAURANT_NAME,
        category: "other",
      })
      .select()
      .single();
  }

  if (inserted.error && isUniqueConstraintViolation(inserted.error)) {
    const { data: afterConflict, error: retryErr } = await supabase
      .from("restaurants")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", SNAPSHOT_RESTAURANT_NAME)
      .order("created_at", { ascending: true })
      .limit(1);
    if (retryErr) return { data: null, error: retryErr.message };
    const row = afterConflict?.[0];
    if (row) return { data: row as Restaurant, error: null };
  }

  if (inserted.error) return { data: null, error: inserted.error.message };
  return { data: inserted.data as Restaurant, error: null };
}

export async function deleteRestaurant(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const { data: target } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (target?.name === SNAPSHOT_RESTAURANT_NAME) {
    return { error: "このお店は削除できません" };
  }

  const { error } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateRestaurantName(
  restaurantId: string,
  rawName: string
): Promise<{
  data: Restaurant | null;
  updatedFavoriteGroupId: string | null;
  error: string | null;
}> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) {
    return { data: null, updatedFavoriteGroupId: null, error: "認証が必要です" };
  }

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
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return { data: null, updatedFavoriteGroupId: null, error: fetchErr.message };
  }
  if (!row) {
    return { data: null, updatedFavoriteGroupId: null, error: "お店が見つかりません" };
  }

  if (row.name === SNAPSHOT_RESTAURANT_NAME) {
    return { data: null, updatedFavoriteGroupId: null, error: "このお店の名前は変更できません" };
  }

  const oldName = row.name;
  if (name === oldName) {
    const { data: full, error: fullErr } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .single();
    if (fullErr || !full) {
      return {
        data: null,
        updatedFavoriteGroupId: null,
        error: fullErr?.message ?? "お店が見つかりません",
      };
    }
    return {
      data: full as Restaurant,
      updatedFavoriteGroupId: null,
      error: null,
    };
  }

  let groupToRenameId: string | null = null;

  const { data: fg } = await supabase
    .from("favorite_groups")
    .select("id")
    .eq("user_id", user.id)
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

    const ids = (entries ?? []).map((e) => e.menu_item_id);
    let allSameRestaurant = true;
    if (ids.length > 0) {
      const { data: items, error: miErr } = await supabase
        .from("menu_items")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .in("id", ids);
      if (miErr) {
        return { data: null, updatedFavoriteGroupId: null, error: miErr.message };
      }
      const miRows = items ?? [];
      if (miRows.length !== ids.length) {
        allSameRestaurant = false;
      } else {
        for (const it of miRows) {
          if (it.restaurant_id !== restaurantId) {
            allSameRestaurant = false;
            break;
          }
        }
      }
    }

    if (allSameRestaurant) {
      groupToRenameId = fg.id;

      const { data: conflict } = await supabase
        .from("favorite_groups")
        .select("id")
        .eq("user_id", user.id)
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
    .eq("user_id", user.id)
    .select()
    .single();

  if (restaurantUpdate.error) {
    return {
      data: null,
      updatedFavoriteGroupId: null,
      error: restaurantUpdate.error.message,
    };
  }

  const updated = restaurantUpdate.data as Restaurant;

  if (groupToRenameId) {
    const fgUp = await supabase
      .from("favorite_groups")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", groupToRenameId)
      .eq("user_id", user.id);

    if (fgUp.error) {
      await supabase
        .from("restaurants")
        .update({ name: oldName })
        .eq("id", restaurantId)
        .eq("user_id", user.id);

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
