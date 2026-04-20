import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { getMealTypeForTimeZone } from "@/lib/meal-timezone";
import { redirect } from "next/navigation";
import TodayClient from "./TodayClient";
import { getOrCreateSnapshotRestaurant } from "./actions/restaurant";
import { fetchFavoriteGroupsPayload } from "./actions/favorites";
import { fetchMenuItemsForRestaurant } from "./actions/menu-item";
import type { FoodLogEntry, MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import { normalizeUserSettings } from "@/lib/diet-phase";
import { sumPfc, type PfcGrams } from "@/lib/pfc";
import { loadPresets } from "@/lib/presets-server";

export type { PresetMeta } from "@/lib/presets-server";

function isMissingColumnError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

async function fetchRestaurantsForToday(
  supabase: Awaited<ReturnType<typeof getSupabaseAuthForRequest>>["supabase"],
  userId: string
) {
  const primary = await supabase
    .from("restaurants")
    .select("id, name, category, order_count, display_order")
    .eq("user_id", userId);
  if (!isMissingColumnError(primary.error)) return primary;

  // Older schema fallback: display_order is unavailable.
  return supabase.from("restaurants").select("id, name, category, order_count").eq("user_id", userId);
}

export default async function TodayPage() {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const [settingsRes, restaurantsRes, foodLogRes, favoritePayload, snapshotRestaurant] =
    await Promise.all([
      supabase
        .from("user_settings")
        .select("diet_phase, phase_profiles")
        .eq("user_id", user.id)
        .maybeSingle(),
      fetchRestaurantsForToday(supabase, user.id),
      supabase
        .from("food_log")
        .select("id, date, meal_type, item_name, grams, protein_g, fat_g, carbs_g, source, menu_item_id")
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
  const initialFavoriteGroups = favoritePayload.error ? [] : favoritePayload.data;
  const hasFavoriteEntries = initialFavoriteGroups.some((group) => group.entries.length > 0);
  const snapshotRestaurantId = snapshotRestaurant.data?.id ?? "";
  const firstVisibleRestaurantId =
    restaurants.find((restaurant) => restaurant.id !== snapshotRestaurantId)?.id ?? "";
  const initialMenuRestaurantId = hasFavoriteEntries ? "" : firstVisibleRestaurantId;
  const initialMenuItemsRes = initialMenuRestaurantId
    ? await fetchMenuItemsForRestaurant(initialMenuRestaurantId)
    : { data: [] as MenuItem[], error: null };
  const menuItems: MenuItem[] = initialMenuItemsRes.data ?? [];
  const initialLoadedRestaurantIds = initialMenuRestaurantId ? [initialMenuRestaurantId] : [];

  const logEntries: FoodLogEntry[] = (foodLogRes.data ?? []) as FoodLogEntry[];
  const summed = logEntries.reduce<PfcGrams>(
    (acc, row) =>
      sumPfc(acc, {
        p: row.protein_g ?? 0,
        f: row.fat_g ?? 0,
        c: row.carbs_g ?? 0,
      }),
    { p: 0, f: 0, c: 0 }
  );
  const todayConsumed: TodayConsumed = {
    protein: summed.p,
    fat: summed.f,
    carbs: summed.c,
  };

  const presets = loadPresets();

  return (
    <div className="flex flex-col min-h-dvh h-dvh bg-gray-950 w-full">
      <TodayClient
        restaurants={restaurants}
        menuItems={menuItems}
        initialLoadedRestaurantIds={initialLoadedRestaurantIds}
        initialFavoriteGroups={initialFavoriteGroups}
        settings={settings}
        todayConsumed={todayConsumed}
        today={today}
        initialLogEntries={logEntries}
        presets={presets}
        initialMealType={initialMealType}
        snapshotRestaurantId={snapshotRestaurantId}
      />
    </div>
  );
}
