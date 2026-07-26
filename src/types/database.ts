import type { DietPhase, PhaseProfiles } from "@/lib/diet-phase";

export type UserSettings = {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
};

/** 日次 PFC 目標スナップショット（Insights 達成率用） */
export type DailyPfcTargetSnapshot = {
  id?: string;
  date: string;
  diet_phase: DietPhase;
  phase_name: string | null;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
  source: string;
};

export type Restaurant = {
  id: string;
  name: string;
  category: string;
  order_count: number;
  display_order?: number;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  order_count: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
  group_order: number;
  shared_barcode?: string | null;
  /** 文科省標準成分表の食品番号（5桁） */
  standard_food_code?: string | null;
  /** `select('*')` で付与。一覧の決定的ソート用 */
  created_at?: string;
};

/** お気に入りエントリ（menu_items 行への参照） */
export type FavoriteEntryPayload = {
  id: string;
  favorite_group_id: string;
  menu_item_id: string;
  display_order: number;
  menu_item?: MenuItem;
};

/** ユーザー別お気に入りグループ（店名など任意のラベル） */
export type FavoriteGroupPayload = {
  id: string;
  name: string;
  display_order: number;
  entries: FavoriteEntryPayload[];
};

export type SharedProduct = {
  barcode: string;
  product_name: string;
  brand: string | null;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  serving_size: string | null;
  serving_size_grams: number | null;
  last_checked_at: string;
  /** `shared_products.source`（lookup の SELECT に含むときのみ） */
  source?: string | null;
};

export type TodayConsumed = {
  protein: number;
  fat: number;
  carbs: number;
};

export type FoodLogEntry = {
  id: string;
  date: string;
  meal_type: string;
  item_name: string;
  grams: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  source: string | null;
  menu_item_id: string | null;
};
