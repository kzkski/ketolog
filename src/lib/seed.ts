// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any; auth?: unknown };

// 新規ユーザー登録時に初期データを投入する（user_settings のみ）
// レストラン・メニューは presets/ のJSONをインポートして使用する
export async function seedUserData(supabase: AnySupabaseClient, userId: string) {
  await supabase.from("user_settings").upsert({
    user_id: userId,
    diet_phase: 1,
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  });
}
