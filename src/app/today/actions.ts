"use server";

import { createClient } from "@/lib/supabase/server";
import type { FoodLogEntry, MenuItem, Restaurant, TodayConsumed } from "@/types/database";

export type SaveItem = {
  menuItemId: string;
  name: string;
  totalGrams: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  restaurantId: string;
};

export async function saveMealToLog(
  items: SaveItem[],
  mealType: string,
  date: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase.from("food_log").insert(
    items.map((item) => ({
      user_id: user.id,
      date,
      meal_type: mealType,
      item_name: item.name,
      grams: item.totalGrams,
      protein_g: item.proteinG,
      fat_g: item.fatG,
      carbs_g: item.carbsG,
      source: item.restaurantId,
      menu_item_id: item.menuItemId,
    }))
  );

  if (error) return { error: error.message };
  return { error: null };
}

// ─── ユーザー設定 ─────────────────────────────────────────────────────────────

export async function updateUserSettings(data: {
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, ...data }, { onConflict: "user_id" });

  if (error) return { error: error.message };
  return { error: null };
}

// ─── 食事ログ操作 ─────────────────────────────────────────────────────────────

export async function getFoodLogForDate(date: string): Promise<{
  entries: FoodLogEntry[];
  consumed: TodayConsumed;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("food_log")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: error.message };

  const entries = (data ?? []) as FoodLogEntry[];
  const consumed = entries.reduce(
    (acc, row) => ({
      protein: acc.protein + (row.protein_g ?? 0),
      fat: acc.fat + (row.fat_g ?? 0),
      carbs: acc.carbs + (row.carbs_g ?? 0),
    }),
    { protein: 0, fat: 0, carbs: 0 }
  );
  return { entries, consumed, error: null };
}

export async function deleteFoodLogEntry(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("food_log")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateFoodLogEntry(
  id: string,
  newGrams: number,
  newMealType: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: entry, error: fetchError } = await supabase
    .from("food_log")
    .select("grams, protein_g, fat_g, carbs_g")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !entry) return { error: fetchError?.message ?? "記録が見つかりません" };

  const oldGrams = entry.grams || 1;
  const pPer100 = (entry.protein_g ?? 0) * 100 / oldGrams;
  const fPer100 = (entry.fat_g ?? 0) * 100 / oldGrams;
  const cPer100 = (entry.carbs_g ?? 0) * 100 / oldGrams;

  const { error } = await supabase
    .from("food_log")
    .update({
      grams: newGrams,
      meal_type: newMealType,
      protein_g: pPer100 * newGrams / 100,
      fat_g: fPer100 * newGrams / 100,
      carbs_g: cPer100 * newGrams / 100,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── メニューアイテム ──────────────────────────────────────────────────────────

export type MenuItemUpdate = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
};

async function resolveMenuItemGroupOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  restaurantId: string,
  groupName: string | null
): Promise<number> {
  if (!groupName) return 0;

  const { data: existing } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("group_name", groupName)
    .limit(1)
    .maybeSingle();

  if (existing && typeof existing.group_order === "number") {
    return existing.group_order;
  }

  const { data: maxRow } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .not("group_name", "is", null)
    .order("group_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (maxRow?.group_order ?? -1) + 1;
}

export async function updateMenuItem(
  id: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: current, error: fetchErr } = await supabase
    .from("menu_items")
    .select("restaurant_id, group_name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { data: null, error: fetchErr?.message ?? "メニューが見つかりません" };
  }

  const prevGroupName = current.group_name?.trim() || null;
  const nextGroupName = data.group_name?.trim() || null;
  const payload: MenuItemUpdate & { group_order?: number } = { ...data, group_name: nextGroupName };

  if (prevGroupName !== nextGroupName) {
    payload.group_order = await resolveMenuItemGroupOrder(
      supabase,
      user.id,
      current.restaurant_id,
      nextGroupName
    );
  }

  const { data: row, error } = await supabase
    .from("menu_items")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: row as MenuItem, error: null };
}

export async function addMenuItem(
  restaurantId: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const groupName = data.group_name?.trim() || null;
  const groupOrder = await resolveMenuItemGroupOrder(
    supabase,
    user.id,
    restaurantId,
    groupName
  );

  const { data: row, error } = await supabase
    .from("menu_items")
    .insert({
      user_id: user.id,
      restaurant_id: restaurantId,
      ...data,
      group_name: groupName,
      group_order: groupOrder,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: row as MenuItem, error: null };
}

export async function deleteMenuItem(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── レストラン ────────────────────────────────────────────────────────────────

export async function addRestaurant(
  name: string,
  category: string
): Promise<{ data: Restaurant | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: row, error } = await supabase
    .from("restaurants")
    .insert({ user_id: user.id, name: name.trim(), category })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: row as Restaurant, error: null };
}

export async function deleteRestaurant(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── エクスポート／インポート ──────────────────────────────────────────────────

export type ImportRestaurantItem = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group?: string | null;
};

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

    const { data: newR, error: rErr } = await supabase
      .from("restaurants")
      .insert({ user_id: user.id, name: r.name, category: r.category })
      .select()
      .single();
    if (rErr || !newR) { skipped.push(r.name); continue; }
    newRestaurants.push(newR as Restaurant);

    if (r.menuItems.length > 0) {
      const groupOrderMap = new Map<string, number>();
      const { data: items } = await supabase
        .from("menu_items")
        .insert(r.menuItems.map(({ group, ...item }) => {
          const g = group ?? null;
          if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
          return { user_id: user.id, restaurant_id: newR.id, ...item, group_name: g, group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0 };
        }))
        .select();
      if (items) newMenuItems.push(...(items as MenuItem[]));
    }
  }

  return { added: newRestaurants.length, skipped, newRestaurants, newMenuItems, error: null };
}

export async function importMenuItemsToRestaurant(
  restaurantId: string,
  items: ImportRestaurantItem[]
): Promise<{ newMenuItems: MenuItem[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { newMenuItems: [], error: "認証が必要です" };

  const groupOrderMap = new Map<string, number>();
  const { data, error } = await supabase
    .from("menu_items")
    .insert(items.map(({ group, ...item }) => {
      const g = group ?? null;
      if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
      return { user_id: user.id, restaurant_id: restaurantId, ...item, group_name: g, group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0 };
    }))
    .select();

  if (error) return { newMenuItems: [], error: error.message };
  return { newMenuItems: (data ?? []) as MenuItem[], error: null };
}
