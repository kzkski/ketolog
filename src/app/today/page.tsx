import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TodayClient from "./TodayClient";
import LogoutButton from "./LogoutButton";
import type { MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";

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
      .select("protein_g, fat_g, carbs_g")
      .eq("user_id", user.id)
      .eq("date", today),
  ]);

  const settings: UserSettings = settingsRes.data ?? {
    diet_phase: 1,
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  };

  // マイフード（category=homemade）を先頭に固定し、以降はorder_count降順
  const rawRestaurants: Restaurant[] = restaurantsRes.data ?? [];
  const restaurants: Restaurant[] = [
    ...rawRestaurants.filter((r) => r.category === "homemade"),
    ...rawRestaurants
      .filter((r) => r.category !== "homemade")
      .sort((a, b) => b.order_count - a.order_count),
  ];

  const menuItems: MenuItem[] = menuItemsRes.data ?? [];

  const todayConsumed: TodayConsumed = (foodLogRes.data ?? []).reduce(
    (acc, row) => ({
      protein: acc.protein + (row.protein_g ?? 0),
      fat: acc.fat + (row.fat_g ?? 0),
      carbs: acc.carbs + (row.carbs_g ?? 0),
    }),
    { protein: 0, fat: 0, carbs: 0 }
  );

  return (
    // max-w-md でモバイルサイズに制限、デスクトップでは中央寄せ＋サイドボーダー
    <div className="flex flex-col h-svh bg-gray-950 max-w-md mx-auto border-x border-gray-800">
      <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 className="text-base font-bold text-white">Ketolog</h1>
        <LogoutButton />
      </header>
      <TodayClient
        restaurants={restaurants}
        menuItems={menuItems}
        settings={settings}
        todayConsumed={todayConsumed}
        today={today}
      />
    </div>
  );
}
