"use server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import type { MenuItem, SharedProduct } from "@/types/database";
import { STANDARD_FOOD_SEARCH_PAGE_SIZE } from "@/lib/standard-food-search";
import {
  MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES,
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
  SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS,
} from "@/lib/shared-product-source";

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
      source: SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS,
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

  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { status: "error", product: null, error: "認証が必要です" };

  const { data: cached } = await supabase
    .from("shared_products")
    .select(
      "barcode, product_name, brand, protein_per_100g, fat_per_100g, carbs_per_100g, serving_size, serving_size_grams, last_checked_at, source"
    )
    .eq("barcode", barcode)
    .maybeSingle();

  if (cached) {
    const source =
      cached.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY
        ? SHARED_PRODUCT_SOURCE_MANUAL_ENTRY
        : SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS;
    const stale = Date.now() - new Date(cached.last_checked_at).getTime() > SHARED_PRODUCT_TTL_MS;
    if (stale && source === SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS) {
      void (async () => {
        const refreshed = await fetchOffProduct(barcode);
        if (refreshed) {
          await upsertSharedProduct(supabase, refreshed);
        }
      })();
    }
    return { status: "ok", product: { ...cached, source } as SharedProduct, error: null };
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
  const { supabase, user } = await getSupabaseAuthForRequest();
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
      notes:
        lookup.product.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY
          ? MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES
          : lookup.product.brand
            ? `OFF: ${lookup.product.brand}`
            : "OFF連携",
      group_name: null,
      group_order: 0,
      shared_barcode: barcode,
      standard_food_code: null,
    })
    .select()
    .single();

  if (insert.error) return { data: null, error: insert.error.message };
  return { data: insert.data as MenuItem, error: null };
}

/**
 * OFF 未ヒットのバーコードを手入力で登録するとき、`shared_products` と `menu_items` を
 * DB トランザクション（RPC）でまとめて追加する（Issue #191）。
 */
export type MenuItemUpdate = {
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  shared_barcode?: string | null;
  standard_food_code?: string | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
};

export async function addMenuItemWithManualSharedProduct(
  restaurantId: string,
  barcodeRaw: string,
  data: MenuItemUpdate
): Promise<{ data: MenuItem | null; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { data: null, error: "認証が必要です" };

  const barcode = normalizeBarcode(barcodeRaw);
  if (!barcode) return { data: null, error: "バーコードが不正です" };

  const trimmedName = data.name.trim();
  if (!trimmedName) return { data: null, error: "名前を入力してください" };

  if (data.standard_food_code) {
    return { data: null, error: "標準成分表とバーコードの同時指定はできません" };
  }

  const rank = data.rank;
  if (!Number.isFinite(rank) || rank < 1 || rank > 4) {
    return { data: null, error: "ランクの値が不正です" };
  }

  const groupName = data.group_name?.trim() || null;
  const groupOrder = await resolveMenuItemGroupOrder(
    supabase,
    user.id,
    restaurantId,
    groupName
  );

  const notes = data.notes?.trim() || MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES;

  const { data: menuId, error: rpcError } = await supabase.rpc(
    "add_menu_item_with_manual_shared_product",
    {
      p_restaurant_id: restaurantId,
      p_barcode: barcode,
      p_shared_product_name: trimmedName,
      p_shared_brand: null,
      p_shared_protein: data.protein_per_100g,
      p_shared_fat: data.fat_per_100g,
      p_shared_carbs: data.carbs_per_100g,
      p_shared_serving_size: null,
      p_shared_serving_size_grams: null,
      p_menu_name: trimmedName,
      p_menu_protein: data.protein_per_100g,
      p_menu_fat: data.fat_per_100g,
      p_menu_carbs: data.carbs_per_100g,
      p_default_grams: data.default_grams,
      p_rank: rank,
      p_notes: notes,
      p_group_name: groupName,
      p_group_order: groupOrder,
    }
  );

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("menu_item_barcode_exists")) {
      return { data: null, error: "このお店に同じバーコードのメニューがあります" };
    }
    if (msg.includes("restaurant not found")) {
      return { data: null, error: "お店が見つかりません" };
    }
    return { data: null, error: msg };
  }

  if (!menuId) return { data: null, error: "メニューの追加に失敗しました" };

  const { data: row, error: fetchErr } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", menuId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !row) {
    return { data: null, error: fetchErr?.message ?? "メニューの取得に失敗しました" };
  }
  return { data: row as MenuItem, error: null };
}

export type StandardFoodSearchRow = {
  food_code: string;
  group_code: string;
  name: string;
  name_normalized: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  source_version: string;
  created_at: string;
};

export async function searchStandardFoods(input: {
  query: string;
  groupCode: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ rows: StandardFoodSearchRow[]; error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { rows: [], error: "認証が必要です" };

  const q = input.query
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const { data, error } = await supabase.rpc("search_standard_foods", {
    p_query: q,
    p_group_code: input.groupCode && input.groupCode.length > 0 ? input.groupCode : null,
    p_limit: input.limit ?? STANDARD_FOOD_SEARCH_PAGE_SIZE,
    p_offset: input.offset ?? 0,
  });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as StandardFoodSearchRow[], error: null };
}

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
  const { supabase, user } = await getSupabaseAuthForRequest();
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
  const { supabase, user } = await getSupabaseAuthForRequest();
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
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}
