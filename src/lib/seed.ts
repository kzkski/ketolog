import myfood from "../../presets/myfood-keto.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any; auth?: unknown };

// 新規ユーザー登録時に初期データを投入する
export async function seedUserData(supabase: AnySupabaseClient, userId: string) {
  await supabase.from("user_settings").upsert({
    user_id: userId,
    diet_phase: 1,
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  });

  // マイフードを自動登録（重複はスキップ）
  const { data: existing } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", userId)
    .eq("name", myfood.name)
    .maybeSingle();

  if (!existing) {
    const { data: restaurant } = await supabase
      .from("restaurants")
      .insert({ user_id: userId, name: myfood.name, category: myfood.category })
      .select()
      .single();

    if (restaurant) {
      await supabase.from("menu_items").insert(
        myfood.menuItems.map((item) => ({
          user_id: userId,
          restaurant_id: restaurant.id,
          ...item,
        }))
      );
    }
  }
}
