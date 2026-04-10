"use server";

import { createClient } from "@/lib/supabase/server";
import type { FoodLogEntry, MenuItem, Restaurant, TodayConsumed, SharedProduct } from "@/types/database";

export type SaveItem = {
  menuItemId: string;
  name: string;
  totalGrams: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  restaurantId: string;
};

const OFF_API_BASE = process.env.OFF_API_BASE ?? "https://world.openfoodfacts.org";
const OFF_DEFAULT_CONTACT = "info@civictech.tv";
const OFF_USER_AGENT =
  process.env.OFF_USER_AGENT ??
  `Ketolog/${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} (${OFF_DEFAULT_CONTACT})`;
const SHARED_PRODUCT_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180日

function normalizeBarcode(raw: string): string {
  return raw.replace(/[^\d]/g, "").trim();
}

function parseOffNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseServingSizeGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null;
  const m = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
  if (!m) return null;
  const grams = Number(m[1]);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

export async function saveMealToLog(
  items: SaveItem[],
  mealType: string,
  date: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase.from("food_log").insert(
    items.map((item) => ({
      user_id: user.id,
      date,
      meal_type: mealType,
      item_name: item.name,
      grams: item.totalGrams,
      protein_g: item.proteinG,
      fat_g: item.fatG,
      carbs_g: item.carbsG,
      source: item.restaurantId,
      menu_item_id: item.menuItemId,
    }))
  );

  if (error) return { error: error.message };
  return { error: null };
}

// ─── ユーザー設定 ─────────────────────────────────────────────────────────────

export async function updateUserSettings(data: {
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, ...data }, { onConflict: "user_id" });

  if (error) return { error: error.message };
  return { error: null };
}

// ─── 食事ログ操作 ─────────────────────────────────────────────────────────────

export async function getFoodLogForDate(date: string): Promise<{
  entries: FoodLogEntry[];
  consumed: TodayConsumed;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("food_log")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) return { entries: [], consumed: { protein: 0, fat: 0, carbs: 0 }, error: error.message };

  const entries = (data ?? []) as FoodLogEntry[];
  const consumed = entries.reduce(
    (acc, row) => ({
      protein: acc.protein + (row.protein_g ?? 0),
      fat: acc.fat + (row.fat_g ?? 0),
      carbs: acc.carbs + (row.carbs_g ?? 0),
    }),
    { protein: 0, fat: 0, carbs: 0 }
  );
  return { entries, consumed, error: null };
}

export async function deleteFoodLogEntry(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("food_log")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateFoodLogEntry(
  id: string,
  newGrams: number,
  newMealType: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: entry, error: fetchError } = await supabase
    .from("food_log")
    .select("grams, protein_g, fat_g, carbs_g")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !entry) return { error: fetchError?.message ?? "記録が見つかりません" };

  const oldGrams = entry.grams || 1;
  const pPer100 = (entry.protein_g ?? 0) * 100 / oldGrams;
  const fPer100 = (entry.fat_g ?? 0) * 100 / oldGrams;
  const cPer100 = (entry.carbs_g ?? 0) * 100 / oldGrams;

  const { error } = await supabase
    .from("food_log")
    .update({
      grams: newGrams,
      meal_type: newMealType,
      protein_g: pPer100 * newGrams / 100,
      fat_g: fPer100 * newGrams / 100,
      carbs_g: cPer100 * newGrams / 100,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── 共有商品（Open Food Facts）──────────────────────────────────────────────

export type BarcodeLookupResult = {
  status: "ok" | "not_found" | "error";
  product: SharedProduct | null;
  error: string | null;
};

async function fetchOffProduct(barcode: string): Promise<SharedProduct | null> {
  const url = `${OFF_API_BASE}/api/v2/product/${barcode}.json?fields=code,product_name,brands,nutriments`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": OFF_USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      serving_size?: string;
      nutriments?: Record<string, unknown>;
    };
  };
  if (json.status !== 1 || !json.product) return null;

  const name = json.product.product_name?.trim();
  if (!name) return null;
  const nutriments = json.product.nutriments ?? {};
  const protein = parseOffNumber(nutriments.proteins_100g);
  const fat = parseOffNumber(nutriments.fat_100g);
  const carbs = parseOffNumber(
    nutriments.carbohydrates_100g ?? nutriments.carbohydrates
  );

  return {
    barcode,
    product_name: name,
    brand: json.product.brands?.trim() || null,
    protein_per_100g: protein,
    fat_per_100g: fat,
    carbs_per_100g: carbs,
    serving_size: json.product.serving_size?.trim() || null,
    serving_size_grams: parseServingSizeGrams(json.product.serving_size),
    last_checked_at: new Date().toISOString(),
  };
}

async function upsertSharedProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  product: SharedProduct
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("shared_products").upsert(
    {
      barcode: product.barcode,
      product_name: product.product_name,
      brand: product.brand,
      protein_per_100g: product.protein_per_100g,
      fat_per_100g: product.fat_per_100g,
      carbs_per_100g: product.carbs_per_100g,
      serving_size: product.serving_size,
      serving_size_grams: product.serving_size_grams,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_json: product,
    },
    { onConflict: "barcode" }
  );
  return { error: error?.message ?? null };
}

export async function lookupSharedProductByBarcode(rawBarcode: string): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) return { status: "error", product: null, error: "バーコードが不正です" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", product: null, error: "認証が必要です" };

  const { data: cached } = await supabase
    .from("shared_products")
    .select("barcode, product_name, brand, protein_per_100g, fat_per_100g, carbs_per_100g, serving_size, serving_size_grams, last_checked_at")
    .eq("barcode", barcode)
    .maybeSingle();

  if (cached) {
    const stale = Date.now() - new Date(cached.last_checked_at).getTime() > SHARED_PRODUCT_TTL_MS;
    if (stale) {
      void (async () => {
        const refreshed = await fetchOffProduct(barcode);
        if (refreshed) {
          await upsertSharedProduct(supabase, refreshed);
        }
      })();
    }
    return { status: "ok", product: cached as SharedProduct, error: null };
  }

  try {
    const fetched = await fetchOffProduct(barcode);
    if (!fetched) return { status: "not_found", product: null, error: null };
    const { error: upsertError } = await upsertSharedProduct(supabase, fetched);
    if (upsertError) {
      return { status: "error", product: null, error: upsertError };
    }
    return { status: "ok", product: fetched, error: null };
  } catch {
    return { status: "error", product: null, error: "OFFからの取得に失敗しました" };
  }
}

export async function addSharedProductMenuItem(input: {
  restaurantId: string;
  barcode: string;
  defaultGrams: number;
  rank?: number;
}): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const barcode = normalizeBarcode(input.barcode);
  if (!barcode) return { data: null, error: "バーコードが不正です" };

  const existing = await supabase
    .from("menu_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("restaurant_id", input.restaurantId)
    .eq("shared_barcode", barcode)
    .limit(1)
    .maybeSingle();
  if (existing.data) return { data: existing.data as MenuItem, error: null };

  const lookup = await lookupSharedProductByBarcode(barcode);
  if (lookup.status !== "ok" || !lookup.product) {
    return { data: null, error: lookup.error ?? "商品情報の取得に失敗しました" };
  }

  const insert = await supabase
    .from("menu_items")
    .insert({
      user_id: user.id,
      restaurant_id: input.restaurantId,
      name: lookup.product.product_name,
      protein_per_100g: lookup.product.protein_per_100g,
      fat_per_100g: lookup.product.fat_per_100g,
      carbs_per_100g: lookup.product.carbs_per_100g,
      default_grams: input.defaultGrams > 0 ? input.defaultGrams : 100,
      rank: input.rank ?? 2,
      notes: lookup.product.brand ? `OFF: ${lookup.product.brand}` : "OFF連携",
      group_name: null,
      group_order: 0,
      shared_barcode: barcode,
    })
    .select()
    .single();

  if (insert.error) return { data: null, error: insert.error.message };
  return { data: insert.data as MenuItem, error: null };
}

// ─── メニューアイテム ──────────────────────────────────────────────────────────

export type MenuItemUpdate = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  shared_barcode?: string | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
};

async function resolveMenuItemGroupOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  restaurantId: string,
  groupName: string | null
): Promise<number> {
  if (!groupName) return 0;

  const { data: existing } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("group_name", groupName)
    .limit(1)
    .maybeSingle();

  if (existing && typeof existing.group_order === "number") {
    return existing.group_order;
  }

  const { data: maxRow } = await supabase
    .from("menu_items")
    .select("group_order")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .not("group_name", "is", null)
    .order("group_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (maxRow?.group_order ?? -1) + 1;
}

export async function updateMenuItem(
  id: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: current, error: fetchErr } = await supabase
    .from("menu_items")
    .select("restaurant_id, group_name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { data: null, error: fetchErr?.message ?? "メニューが見つかりません" };
  }

  const prevGroupName = current.group_name?.trim() || null;
  const nextGroupName = data.group_name?.trim() || null;
  const payload: MenuItemUpdate & { group_order?: number } = { ...data, group_name: nextGroupName };

  if (prevGroupName !== nextGroupName) {
    payload.group_order = await resolveMenuItemGroupOrder(
      supabase,
      user.id,
      current.restaurant_id,
      nextGroupName
    );
  }

  const { data: row, error } = await supabase
    .from("menu_items")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: row as MenuItem, error: null };
}

export async function addMenuItem(
  restaurantId: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const groupName = data.group_name?.trim() || null;
  const groupOrder = await resolveMenuItemGroupOrder(
    supabase,
    user.id,
    restaurantId,
    groupName
  );

  const { data: row, error } = await supabase
    .from("menu_items")
    .insert({
      user_id: user.id,
      restaurant_id: restaurantId,
      ...data,
      group_name: groupName,
      group_order: groupOrder,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: row as MenuItem, error: null };
}

export async function deleteMenuItem(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── レストラン ────────────────────────────────────────────────────────────────

async function nextRestaurantDisplayOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { data: row } = await supabase
    .from("restaurants")
    .select("display_order")
    .eq("user_id", userId)
    .neq("category", "homemade")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (row?.display_order ?? -1) + 1;
}

export async function addRestaurant(
  name: string,
  category: string
): Promise<{ data: Restaurant | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const displayOrder =
    category === "homemade" ? 0 : await nextRestaurantDisplayOrder(supabase, user.id);

  const first = await supabase
    .from("restaurants")
    .insert({ user_id: user.id, name: name.trim(), category, display_order: displayOrder })
    .select()
    .single();
  if (first.error && first.error.message.includes("display_order")) {
    const fallback = await supabase
      .from("restaurants")
      .insert({ user_id: user.id, name: name.trim(), category })
      .select()
      .single();
    if (fallback.error) return { data: null, error: fallback.error.message };
    return { data: fallback.data as Restaurant, error: null };
  }

  if (first.error) return { data: null, error: first.error.message };
  return { data: first.data as Restaurant, error: null };
}

export async function reorderRestaurants(
  orderedNonHomemadeIds: string[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };
  if (orderedNonHomemadeIds.length === 0) return { error: null };

  const { data: rows, error: fetchErr } = await supabase
    .from("restaurants")
    .select("id, category")
    .eq("user_id", user.id)
    .in("id", orderedNonHomemadeIds);
  if (fetchErr) return { error: fetchErr.message };
  if (!rows || rows.length !== orderedNonHomemadeIds.length) {
    return { error: "お店の指定が不正です" };
  }
  if (rows.some((r: { category: string }) => r.category === "homemade")) {
    return { error: "マイフードの順序は変更できません" };
  }

  const updates = orderedNonHomemadeIds.map((id, index) =>
    supabase
      .from("restaurants")
      .update({ display_order: index })
      .eq("id", id)
      .eq("user_id", user.id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (!failed.error.message.includes("display_order")) {
      return { error: failed.error.message };
    }

    // 旧スキーマ互換: display_order が未適用の場合は order_count で順序を保存する
    const base = orderedNonHomemadeIds.length;
    const fallbackUpdates = orderedNonHomemadeIds.map((id, index) =>
      supabase
        .from("restaurants")
        .update({ order_count: base - index })
        .eq("id", id)
        .eq("user_id", user.id)
    );
    const fallbackResults = await Promise.all(fallbackUpdates);
    const fallbackFailed = fallbackResults.find((r) => r.error);
    if (fallbackFailed?.error) return { error: fallbackFailed.error.message };
  }
  return { error: null };
}

export async function deleteRestaurant(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// ─── エクスポート／インポート ──────────────────────────────────────────────────

export type ImportRestaurantItem = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  shared_barcode?: string | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group?: string | null;
};

export type ImportRestaurantEntry = {
  name: string;
  category: string;
  menuItems: ImportRestaurantItem[];
};

export type ImportData = {
  version: number;
  restaurants: ImportRestaurantEntry[];
};

export async function importRestaurantData(data: ImportData): Promise<{
  added: number;
  skipped: string[];
  newRestaurants: Restaurant[];
  newMenuItems: MenuItem[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { added: 0, skipped: [], newRestaurants: [], newMenuItems: [], error: "認証が必要です" };

  const { data: existing } = await supabase
    .from("restaurants")
    .select("name")
    .eq("user_id", user.id);
  const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name));

  const skipped: string[] = [];
  const newRestaurants: Restaurant[] = [];
  const newMenuItems: MenuItem[] = [];

  for (const r of data.restaurants) {
    if (existingNames.has(r.name)) { skipped.push(r.name); continue; }

    const displayOrder =
      r.category === "homemade" ? 0 : await nextRestaurantDisplayOrder(supabase, user.id);
    let { data: newR, error: rErr } = await supabase
      .from("restaurants")
      .insert({ user_id: user.id, name: r.name, category: r.category, display_order: displayOrder })
      .select()
      .single();
    if (rErr && rErr.message.includes("display_order")) {
      const fallback = await supabase
        .from("restaurants")
        .insert({ user_id: user.id, name: r.name, category: r.category })
        .select()
        .single();
      newR = fallback.data;
      rErr = fallback.error;
    }
    if (rErr || !newR) { skipped.push(r.name); continue; }
    newRestaurants.push(newR as Restaurant);

    if (r.menuItems.length > 0) {
      const groupOrderMap = new Map<string, number>();
      const { data: items } = await supabase
        .from("menu_items")
        .insert(r.menuItems.map(({ group, shared_barcode, ...item }) => {
          const g = group ?? null;
          if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
          return {
            user_id: user.id,
            restaurant_id: newR.id,
            ...item,
            shared_barcode: shared_barcode ?? null,
            group_name: g,
            group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
          };
        }))
        .select();
      if (items) newMenuItems.push(...(items as MenuItem[]));
    }
  }

  return { added: newRestaurants.length, skipped, newRestaurants, newMenuItems, error: null };
}

export async function importMenuItemsToRestaurant(
  restaurantId: string,
  items: ImportRestaurantItem[]
): Promise<{ newMenuItems: MenuItem[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { newMenuItems: [], error: "認証が必要です" };

  const groupOrderMap = new Map<string, number>();
  const { data, error } = await supabase
    .from("menu_items")
    .insert(items.map(({ group, shared_barcode, ...item }) => {
      const g = group ?? null;
      if (g !== null && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
      return {
        user_id: user.id,
        restaurant_id: restaurantId,
        ...item,
        shared_barcode: shared_barcode ?? null,
        group_name: g,
        group_order: g !== null ? (groupOrderMap.get(g) ?? 0) : 0,
      };
    }))
    .select();

  if (error) return { newMenuItems: [], error: error.message };
  return { newMenuItems: (data ?? []) as MenuItem[], error: null };
}
