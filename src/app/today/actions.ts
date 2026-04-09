"use server";

import { createClient } from "@/lib/supabase/server";
import type { MenuItem, Restaurant } from "@/types/database";

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

// ─── メニューアイテム ──────────────────────────────────────────────────────────

export type MenuItemUpdate = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  rank: number;
  notes: string | null;
};

export async function updateMenuItem(
  id: string,
  data: MenuItemUpdate
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("menu_items")
    .update(data)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function addMenuItem(
  restaurantId: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: row, error } = await supabase
    .from("menu_items")
    .insert({ user_id: user.id, restaurant_id: restaurantId, ...data })
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
