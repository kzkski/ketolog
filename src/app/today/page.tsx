import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { getMealTypeForTimeZone } from "@/lib/meal-timezone";
import { redirect } from "next/navigation";
import TodayClient from "./TodayClient";
import { getOrCreateSnapshotRestaurant, fetchFavoriteGroupsPayload } from "./actions";
import type { FoodLogEntry, MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import { normalizeUserSettings } from "@/lib/diet-phase";
import { loadPresets } from "@/lib/presets-server";

export type { PresetMeta } from "@/lib/presets-server";

export default async function TodayPage() {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const [settingsRes, restaurantsRes, menuItemsRes, foodLogRes, favoritePayload, snapshotRestaurant] =
    await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("restaurants").select("*").eq("user_id", user.id),
      supabase
        .from("menu_items")
        .select("*")
        .eq("user_id", user.id)
        .order("rank")
        .order("name")
        .order("created_at", { ascending: true })
        .order("id"),
      supabase
        .from("food_log")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .order("created_at", { ascending: true }),
      fetchFavoriteGroupsPayload(),
      getOrCreateSnapshotRestaurant(),
    ]);

  const settings: UserSettings = settingsRes.data
    ? normalizeUserSettings(settingsRes.data)
    : normalizeUserSettings(null);

  const rawRestaurants: Restaurant[] = restaurantsRes.data ?? [];
  const rawWithSnapshot =
    snapshotRestaurant.data &&
    !rawRestaurants.some((r) => r.id === snapshotRestaurant.data!.id)
      ? [...rawRestaurants, snapshotRestaurant.data]
      : rawRestaurants;

  const restaurants: Restaurant[] = [...rawWithSnapshot].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) {
      return ao - bo;
    }
    return b.order_count - a.order_count;
  });

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
  const initialFavoriteGroups = favoritePayload.error ? [] : favoritePayload.data;

  return (
    <div className="flex flex-col min-h-dvh h-dvh bg-gray-950 w-full">
      <TodayClient
        restaurants={restaurants}
        menuItems={menuItems}
        initialFavoriteGroups={initialFavoriteGroups}
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
