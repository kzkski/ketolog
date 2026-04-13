import conveniencePreset from "../../public/presets/convenience-keto.json";
import steakPreset from "../../public/presets/external-steak-keto.json";
import izakayaPreset from "../../public/presets/external-izakaya-keto.json";
import yakinikuPreset from "../../public/presets/external-yakiniku-keto.json";
import yakitoriPreset from "../../public/presets/external-yakitori-keto.json";
import homemadePreset from "../../public/presets/homemade-keto.json";
import kfcPreset from "../../public/presets/kfc-original-chicken.json";
import { DEFAULT_PHASE_PROFILES } from "@/lib/diet-phase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any; auth?: unknown };
type PresetMenuItem = Record<string, unknown> & { group?: string | null };
type PresetDefinition = {
  name: string;
  category: string;
  menuItems: PresetMenuItem[];
};

const INITIAL_PRESETS: PresetDefinition[] = [
  homemadePreset as PresetDefinition,
  conveniencePreset as PresetDefinition,
  steakPreset as PresetDefinition,
  izakayaPreset as PresetDefinition,
  yakinikuPreset as PresetDefinition,
  yakitoriPreset as PresetDefinition,
  kfcPreset as PresetDefinition,
];

// 新規ユーザー登録時に初期データを投入する
export async function seedUserData(supabase: AnySupabaseClient, userId: string) {
  await supabase.from("user_settings").upsert({
    user_id: userId,
    diet_phase: 1,
    phase_profiles: DEFAULT_PHASE_PROFILES,
  });

  // 同名レストランは投入済みとみなしてスキップ
  const { data: existingRestaurants } = await supabase
    .from("restaurants")
    .select("name, display_order")
    .eq("user_id", userId);

  const existingNames = new Set((existingRestaurants ?? []).map((r: { name: string }) => r.name));
  let nextDisplayOrder =
    (existingRestaurants ?? []).reduce(
      (max: number, r: { display_order: number | null }) =>
        Math.max(max, r.display_order ?? -1),
      -1
    ) + 1;

  for (const preset of INITIAL_PRESETS) {
    if (!preset.name || existingNames.has(preset.name)) continue;

    const { data: restaurant } = await supabase
      .from("restaurants")
      .insert({
        user_id: userId,
        name: preset.name,
        category: preset.category,
        display_order: nextDisplayOrder,
      })
      .select()
      .single();

    if (!restaurant) continue;
    existingNames.add(preset.name);
    nextDisplayOrder += 1;

    const groupOrderMap = new Map<string, number>();
    await supabase.from("menu_items").insert(
      preset.menuItems.map(({ group, ...item }) => {
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
