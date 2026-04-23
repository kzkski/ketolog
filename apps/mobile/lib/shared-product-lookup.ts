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

import { getMobileOffFetchOptions } from "./off-config";

const SHARED_PRODUCT_TTL_MS = 1000 * 60 * 60 * 24 * 180;

export type SharedProductRow = OpenFoodFactsProduct & {
  source?: string | null;
};

export type BarcodeLookupResult = {
  status: "ok" | "not_found" | "error";
  product: SharedProductRow | null;
  error: string | null;
};

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
  rawBarcode: string
): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) return { status: "error", product: null, error: "バーコードが不正です" };

  const offOpts = getMobileOffFetchOptions();

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
    const stale =
      Date.now() - new Date(String(cached.last_checked_at)).getTime() > SHARED_PRODUCT_TTL_MS;
    if (stale && source === SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS) {
      void (async () => {
        const refreshed = await fetchOpenFoodFactsProduct(barcode, offOpts);
        if (refreshed) {
          await upsertSharedProductOff(supabase, refreshed);
        }
      })();
    }
    return { status: "ok", product: { ...cached, source } as SharedProductRow, error: null };
  }

  try {
    const fetched = await fetchOpenFoodFactsProduct(barcode, offOpts);
    if (!fetched) return { status: "not_found", product: null, error: null };
    const { error: upsertError } = await upsertSharedProductOff(supabase, fetched);
    if (upsertError) {
      return { status: "error", product: null, error: upsertError };
    }
    return { status: "ok", product: fetched, error: null };
  } catch {
    return { status: "error", product: null, error: "OFFからの取得に失敗しました" };
  }
}
