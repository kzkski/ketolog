// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any; auth?: unknown };

// 新規ユーザー登録時に初期データを投入する
// 栄養値はすべて per 100g（概算値 — ユーザーが後から修正可能）
export async function seedUserData(supabase: AnySupabaseClient, userId: string) {
  // user_settings（フェーズ1のデフォルト値）
  await supabase.from("user_settings").upsert({
    user_id: userId,
    diet_phase: 1,
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  });

  // 天竜レストランを登録
  const { data: restaurant } = await supabase
    .from("restaurants")
    .insert({ user_id: userId, name: "天竜", category: "external" })
    .select("id")
    .single();

  if (!restaurant) return;

  // 天竜メニュー（per 100g / default_grams = 1切れの重さ）
  await supabase.from("menu_items").insert([
    // rank1: ホルモン系（最優先）
    { user_id: userId, restaurant_id: restaurant.id, name: "ハツ",                             protein_per_100g: 16.5, fat_per_100g:  7.6, carbs_per_100g: 0.1, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ミノ",                             protein_per_100g: 13.0, fat_per_100g:  6.8, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ハチノス",                         protein_per_100g: 12.0, fat_per_100g:  5.0, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "センマイ",                         protein_per_100g: 11.0, fat_per_100g:  3.5, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ギアラ",                           protein_per_100g:  9.5, fat_per_100g: 12.0, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "コブクロ",                         protein_per_100g: 12.5, fat_per_100g:  7.5, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "シマチョウ",                       protein_per_100g:  9.0, fat_per_100g: 22.0, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "マルチョウ",                       protein_per_100g:  8.5, fat_per_100g: 26.0, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "レバー",                           protein_per_100g: 19.6, fat_per_100g:  3.7, carbs_per_100g: 2.5, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ハラミ",                           protein_per_100g: 16.0, fat_per_100g: 12.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "キクアブラ",                       protein_per_100g:  8.0, fat_per_100g: 28.0, carbs_per_100g: 0.0, default_grams: 15,  rank: 1 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ホルモン盛り合わせ（味噌ダレ）",   protein_per_100g: 10.0, fat_per_100g: 18.0, carbs_per_100g: 2.0, default_grams: 25,  rank: 1 },
    // rank2: 定番焼肉
    { user_id: userId, restaurant_id: restaurant.id, name: "タン",                             protein_per_100g: 13.3, fat_per_100g: 21.7, carbs_per_100g: 0.2, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "カルビ",                           protein_per_100g: 11.0, fat_per_100g: 25.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ロース",                           protein_per_100g: 13.0, fat_per_100g: 20.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ザブトン",                         protein_per_100g: 12.0, fat_per_100g: 22.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "イチボ",                           protein_per_100g: 14.0, fat_per_100g: 18.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ミスジ",                           protein_per_100g: 14.5, fat_per_100g: 16.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "ランプ",                           protein_per_100g: 15.0, fat_per_100g: 14.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 2 },
    // rank2: サイド
    { user_id: userId, restaurant_id: restaurant.id, name: "冷奴",                             protein_per_100g:  4.9, fat_per_100g:  3.0, carbs_per_100g: 2.0, default_grams: 150, rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "生野菜サラダ",                     protein_per_100g:  1.0, fat_per_100g:  0.2, carbs_per_100g: 3.0, default_grams: 100, rank: 2 },
    { user_id: userId, restaurant_id: restaurant.id, name: "わかめスープ",                     protein_per_100g:  1.0, fat_per_100g:  0.3, carbs_per_100g: 0.7, default_grams: 150, rank: 2 },
    // rank3: 控えめ
    { user_id: userId, restaurant_id: restaurant.id, name: "ブタバラ",                         protein_per_100g: 10.0, fat_per_100g: 28.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 3 },
    { user_id: userId, restaurant_id: restaurant.id, name: "トントロ",                         protein_per_100g:  9.0, fat_per_100g: 30.0, carbs_per_100g: 0.1, default_grams: 15,  rank: 3 },
    { user_id: userId, restaurant_id: restaurant.id, name: "キムチ",                           protein_per_100g:  2.0, fat_per_100g:  0.5, carbs_per_100g: 4.5, default_grams: 50,  rank: 3 },
    // rank4: 避ける
    { user_id: userId, restaurant_id: restaurant.id, name: "ご飯",                             protein_per_100g:  2.5, fat_per_100g:  0.3, carbs_per_100g:37.1, default_grams: 150, rank: 4 },
    { user_id: userId, restaurant_id: restaurant.id, name: "麺類",                             protein_per_100g:  4.0, fat_per_100g:  1.0, carbs_per_100g:30.0, default_grams: 200, rank: 4 },
    { user_id: userId, restaurant_id: restaurant.id, name: "焼肉のタレ",                       protein_per_100g:  3.0, fat_per_100g:  2.0, carbs_per_100g:36.0, default_grams: 30,  rank: 4 },
  ]);

  // マイフードレストランを登録
  const { data: myFood } = await supabase
    .from("restaurants")
    .insert({ user_id: userId, name: "マイフード", category: "homemade" })
    .select("id")
    .single();

  if (!myFood) return;

  // マイフード（per 100g — 一部は文科省成分表準拠の概算値）
  await supabase.from("menu_items").insert([
    { user_id: userId, restaurant_id: myFood.id, name: "バターコーヒー（グラスフェッドバター+MCTオイル）", protein_per_100g:  0.1, fat_per_100g: 13.5, carbs_per_100g: 0.0, default_grams: 200, rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "ゆで卵",                                         protein_per_100g: 12.3, fat_per_100g: 10.3, carbs_per_100g: 0.2, default_grams: 60,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "WPIプロテイン（X-PLOSION Plain）",               protein_per_100g: 80.0, fat_per_100g:  1.7, carbs_per_100g: 3.3, default_grams: 30,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "Oikosヨーグルト",                                protein_per_100g: 11.5, fat_per_100g:  0.0, carbs_per_100g: 2.8, default_grams: 113, rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "塩サバ",                                         protein_per_100g: 19.0, fat_per_100g: 16.5, carbs_per_100g: 0.1, default_grams: 120, rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "さば水煮缶",                                     protein_per_100g: 16.3, fat_per_100g:  8.6, carbs_per_100g: 0.2, default_grams: 190, rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "鶏もも皮つき（冷凍）",                           protein_per_100g: 17.3, fat_per_100g: 14.2, carbs_per_100g: 0.0, default_grams: 135, rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "絹ごし豆腐",                                     protein_per_100g:  5.3, fat_per_100g:  3.0, carbs_per_100g: 2.0, default_grams: 150, rank: 2 },
    { user_id: userId, restaurant_id: myFood.id, name: "ブロッコリー",                                   protein_per_100g:  4.3, fat_per_100g:  0.5, carbs_per_100g: 3.7, default_grams: 100, rank: 2 },
    { user_id: userId, restaurant_id: myFood.id, name: "カマンベールチーズ",                             protein_per_100g: 12.5, fat_per_100g: 31.3, carbs_per_100g: 0.9, default_grams: 25,  rank: 2 },
    { user_id: userId, restaurant_id: myFood.id, name: "マカダミアナッツ",                               protein_per_100g:  7.9, fat_per_100g: 76.8, carbs_per_100g: 5.2, default_grams: 30,  rank: 2 },
    { user_id: userId, restaurant_id: myFood.id, name: "くるみ",                                         protein_per_100g: 14.6, fat_per_100g: 68.8, carbs_per_100g: 7.5, default_grams: 30,  rank: 2 },
    { user_id: userId, restaurant_id: myFood.id, name: "ラード",                                         protein_per_100g:  0.0, fat_per_100g: 99.7, carbs_per_100g: 0.0, default_grams: 10,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "グラスフェッドバター",                           protein_per_100g:  0.6, fat_per_100g: 81.0, carbs_per_100g: 0.2, default_grams: 10,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "MCTオイル",                                      protein_per_100g:  0.0, fat_per_100g:100.0, carbs_per_100g: 0.0, default_grams: 10,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "純オリーブオイル",                               protein_per_100g:  0.0, fat_per_100g: 99.9, carbs_per_100g: 0.0, default_grams: 10,  rank: 1 },
    { user_id: userId, restaurant_id: myFood.id, name: "ノンアルハイボール（難消化性デキストリン入り）", protein_per_100g:  0.0, fat_per_100g:  0.0, carbs_per_100g: 0.3, default_grams: 350, rank: 2 },
  ]);
}
