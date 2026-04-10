import { createClient } from "@/lib/supabase/server";
import { getMealTypeForTimeZone } from "@/lib/meal-timezone";
import { redirect } from "next/navigation";
import TodayClient from "./TodayClient";
import { getOrCreateSnapshotRestaurant } from "./actions";
import type { FoodLogEntry, MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import fs from "fs";
import path from "path";

export type PresetMeta = { name: string; file: string; itemCount: number };

function loadPresets(): PresetMeta[] {
  const dir = path.join(process.cwd(), "public", "presets");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      return { name: json.name as string, file, itemCount: (json.menuItems as unknown[]).length };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const [settingsRes, restaurantsRes, menuItemsRes, foodLogRes] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("restaurants").select("*").eq("user_id", user.id),
    supabase
      .from("menu_items")
      .select("*")
      .eq("user_id", user.id)
      .order("rank")
      .order("order_count", { ascending: false }),
    supabase
      .from("food_log")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .order("created_at", { ascending: true }),
  ]);

  const settings: UserSettings = settingsRes.data ?? {
    diet_phase: 1,
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  };

  // マイフード（category=homemade）を先頭に固定し、以降はdisplay_order昇順
  const rawRestaurants: Restaurant[] = restaurantsRes.data ?? [];
  const snapshotRestaurant = await getOrCreateSnapshotRestaurant();
  const rawWithSnapshot =
    snapshotRestaurant.data &&
    !rawRestaurants.some((r) => r.id === snapshotRestaurant.data!.id)
      ? [...rawRestaurants, snapshotRestaurant.data]
      : rawRestaurants;

  const restaurants: Restaurant[] = [
    ...rawWithSnapshot.filter((r) => r.category === "homemade"),
    ...rawWithSnapshot
      .filter((r) => r.category !== "homemade")
      .sort((a, b) => {
        const ao = a.display_order ?? 0;
        const bo = b.display_order ?? 0;
        if (ao !== bo) {
          return ao - bo;
        }
        return b.order_count - a.order_count;
      }),
  ];

  const initialMealType = getMealTypeForTimeZone(new Date(), "Asia/Tokyo");

  const menuItems: MenuItem[] = menuItemsRes.data ?? [];

  const logEntries: FoodLogEntry[] = (foodLogRes.data ?? []) as FoodLogEntry[];
  const todayConsumed: TodayConsumed = logEntries.reduce(
    (acc, row) => ({
      protein: acc.protein + (row.protein_g ?? 0),
      fat: acc.fat + (row.fat_g ?? 0),
      carbs: acc.carbs + (row.carbs_g ?? 0),
    }),
    { protein: 0, fat: 0, carbs: 0 }
  );

  const presets = loadPresets();

  return (
    <div className="flex flex-col h-svh bg-gray-950 w-full">
      <TodayClient
        restaurants={restaurants}
        menuItems={menuItems}
        settings={settings}
        todayConsumed={todayConsumed}
        today={today}
        initialLogEntries={logEntries}
        presets={presets}
        initialMealType={initialMealType}
        snapshotRestaurantId={snapshotRestaurant.data?.id ?? ""}
      />
    </div>
  );
}
