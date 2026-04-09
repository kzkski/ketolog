export type UserSettings = {
  diet_phase: number;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
};

export type Restaurant = {
  id: string;
  name: string;
  category: string;
  order_count: number;
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
};

export type TodayConsumed = {
  protein: number;
  fat: number;
  carbs: number;
};
