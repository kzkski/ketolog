"use server";

import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
