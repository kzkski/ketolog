import homemadePreset from "../../public/presets/homemade-keto.json";

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

  // 汎用食材プリセットを通常レストランとして登録（重複はスキップ）
  const { data: existing } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", userId)
    .eq("name", homemadePreset.name)
    .maybeSingle();

  if (!existing) {
    const { data: maxRow } = await supabase
      .from("restaurants")
      .select("display_order")
      .eq("user_id", userId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const displayOrder = (maxRow?.display_order ?? -1) + 1;

    const { data: restaurant } = await supabase
      .from("restaurants")
      .insert({
        user_id: userId,
        name: homemadePreset.name,
        category: homemadePreset.category,
        display_order: displayOrder,
      })
      .select()
      .single();

    if (restaurant) {
      const groupOrderMap = new Map<string, number>();
      await supabase.from("menu_items").insert(
        homemadePreset.menuItems.map(({ group, ...item }) => {
          const g = group ?? null;
          if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
          return {
            user_id: userId,
            restaurant_id: restaurant.id,
            ...item,
            group_name: g,
            group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
          };
        })
      );
    }
  }
}
