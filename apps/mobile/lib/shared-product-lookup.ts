import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOpenFoodFactsProduct,
  normalizeBarcode,
  type OpenFoodFactsProduct,
} from "@ketolog/domain/open-food-facts";
import {
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
  SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS,
} from "@ketolog/domain/shared-product-source";

import {
  resolveBarcodePrefill,
  type BarcodePrefill,
  type OwnBarcodeMenuMatch,
} from "@ketolog/domain/barcode-menu-prefill";

import { getMobileOffFetchOptions } from "./off-config";

const SHARED_PRODUCT_TTL_MS = 1000 * 60 * 60 * 24 * 180;

export type SharedProductRow = OpenFoodFactsProduct & {
  source?: string | null;
};

export type BarcodeLookupResult = {
  status: "ok" | "not_found" | "error";
  product: SharedProductRow | null;
  /** フォームへ入れる値（自分のメニュー優先。Issue #358） */
  prefill: BarcodePrefill | null;
  /** 同じバーコードの自分のメニュー（全店舗）。同じ店での重複判定に使う */
  ownMenuItems: OwnBarcodeMenuMatch[];
  error: string | null;
};

const OWN_BARCODE_MENU_SELECT =
  "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, notes, updated_at, restaurants(name)";

type OwnBarcodeMenuRow = Omit<OwnBarcodeMenuMatch, "restaurant_name"> & {
  restaurants: { name: string } | { name: string }[] | null;
};

function toOwnBarcodeMenuMatch(row: OwnBarcodeMenuRow): OwnBarcodeMenuMatch {
  const { restaurants, ...rest } = row;
  const restaurant = Array.isArray(restaurants) ? restaurants[0] : restaurants;
  return { ...rest, restaurant_name: restaurant?.name ?? null };
}

async function upsertSharedProductOff(
  supabase: SupabaseClient,
  product: OpenFoodFactsProduct
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
      raw_json: product as unknown as Record<string, unknown>,
    },
    { onConflict: "barcode" }
  );
  return { error: error?.message ?? null };
}

/**
 * Web `lookupSharedProductByBarcode` と同等（認証済み Supabase クライアント前提）。
 */
export async function lookupSharedProductByBarcodeMobile(
  supabase: SupabaseClient,
  userId: string,
  rawBarcode: string
): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    return { status: "error", product: null, prefill: null, ownMenuItems: [], error: "バーコードが不正です" };
  }

  const offOpts = getMobileOffFetchOptions();

  const [{ data: ownRows, error: ownError }, { data: cached }] = await Promise.all([
    supabase
      .from("menu_items")
      .select(OWN_BARCODE_MENU_SELECT)
      .eq("user_id", userId)
      .eq("shared_barcode", barcode)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("shared_products")
      .select(
        "barcode, product_name, brand, protein_per_100g, fat_per_100g, carbs_per_100g, serving_size, serving_size_grams, last_checked_at, source"
      )
      .eq("barcode", barcode)
      .maybeSingle(),
  ]);
  if (ownError) {
    return { status: "error", product: null, prefill: null, ownMenuItems: [], error: ownError.message };
  }
  const ownMenuItems = ((ownRows ?? []) as OwnBarcodeMenuRow[]).map(toOwnBarcodeMenuMatch);

  const ok = (product: SharedProductRow | null): BarcodeLookupResult => {
    const prefill = resolveBarcodePrefill({ ownMenuItems, sharedProduct: product });
    return prefill
      ? { status: "ok", product, prefill, ownMenuItems, error: null }
      : { status: "not_found", product: null, prefill: null, ownMenuItems, error: null };
  };

  if (cached) {
    const source =
      cached.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY
        ? SHARED_PRODUCT_SOURCE_MANUAL_ENTRY
        : SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS;
    const stale =
      Date.now() - new Date(String(cached.last_checked_at)).getTime() > SHARED_PRODUCT_TTL_MS;
    if (stale && source === SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS && ownMenuItems.length === 0) {
      void (async () => {
        const refreshed = await fetchOpenFoodFactsProduct(barcode, offOpts);
        if (refreshed) {
          await upsertSharedProductOff(supabase, refreshed);
        }
      })();
    }
    return ok({ ...cached, source } as SharedProductRow);
  }

  // shared_barcode は shared_products への FK なので、自メニューがあれば cached も必ずある
  if (ownMenuItems.length > 0) return ok(null);

  try {
    const fetched = await fetchOpenFoodFactsProduct(barcode, offOpts);
    if (!fetched) return ok(null);
    const { error: upsertError } = await upsertSharedProductOff(supabase, fetched);
    if (upsertError) {
      return { status: "error", product: null, prefill: null, ownMenuItems, error: upsertError };
    }
    return ok(fetched);
  } catch {
    return { status: "error", product: null, prefill: null, ownMenuItems, error: "OFFからの取得に失敗しました" };
  }
}
