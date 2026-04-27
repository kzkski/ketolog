export const DEFAULT_OFF_API_BASE = "https://world.openfoodfacts.org";

export type OpenFoodFactsProduct = {
  barcode: string;
  product_name: string;
  brand: string | null;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  serving_size: string | null;
  serving_size_grams: number | null;
  last_checked_at: string;
};

export function normalizeBarcode(raw: string): string {
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

export function getDefaultOffUserAgent(appVersion: string): string {
  return `Ketolog/${appVersion} (info@civictech.tv)`;
}

/**
 * Open Food Facts API v2 から商品を取得（Web / Mobile 共通）。
 */
export async function fetchOpenFoodFactsProduct(
  barcode: string,
  options?: { apiBase?: string; userAgent?: string }
): Promise<OpenFoodFactsProduct | null> {
  const base = (options?.apiBase ?? DEFAULT_OFF_API_BASE).replace(/\/$/, "");
  const url = `${base}/api/v2/product/${barcode}.json?fields=code,product_name,brands,nutriments,serving_size`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": options?.userAgent ?? getDefaultOffUserAgent("dev") },
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
