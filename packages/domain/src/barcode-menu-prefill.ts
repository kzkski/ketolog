import {
  MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES,
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
} from "./shared-product-source";

/**
 * バーコード読み取り時にフォームへ入れる値の出どころ（Issue #358）。
 * 優先順: 自分のメニュー → shared_products（手入力共有 / Open Food Facts）。
 */
export type BarcodeValueSource = "own_menu_item" | "shared_manual_entry" | "open_food_facts";

/** 同じバーコードを持つ自分の `menu_items` 行（店舗は問わない） */
export type OwnBarcodeMenuMatch = {
  id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  notes: string | null;
  updated_at: string | null;
};

export type SharedProductLike = {
  product_name: string;
  brand: string | null;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  serving_size: string | null;
  serving_size_grams: number | null;
  source?: string | null;
};

export type BarcodePrefill = {
  source: BarcodeValueSource;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  /** 1回量。自メニューは default_grams、共有は serving_size_grams（> 0 のときのみ） */
  default_grams: number | null;
  notes: string | null;
  /** 共有の serving_size（表示用）。自メニュー由来では null */
  serving_size: string | null;
  /** 自メニュー由来のときの店名 */
  from_restaurant_name: string | null;
};

/** 最後に保存した自メニュー（updated_at DESC → id DESC） */
export function pickLatestOwnMenuItem(rows: OwnBarcodeMenuMatch[]): OwnBarcodeMenuMatch | null {
  let best: OwnBarcodeMenuMatch | null = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const a = row.updated_at ?? "";
    const b = best.updated_at ?? "";
    if (a > b || (a === b && row.id > best.id)) best = row;
  }
  return best;
}

export function resolveBarcodePrefill(input: {
  ownMenuItems: OwnBarcodeMenuMatch[];
  sharedProduct: SharedProductLike | null;
}): BarcodePrefill | null {
  const own = pickLatestOwnMenuItem(input.ownMenuItems);
  if (own) {
    return {
      source: "own_menu_item",
      name: own.name,
      protein_per_100g: own.protein_per_100g,
      fat_per_100g: own.fat_per_100g,
      carbs_per_100g: own.carbs_per_100g,
      default_grams: own.default_grams,
      notes: own.notes,
      serving_size: null,
      from_restaurant_name: own.restaurant_name,
    };
  }

  const shared = input.sharedProduct;
  if (!shared) return null;
  const manual = shared.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY;
  return {
    source: manual ? "shared_manual_entry" : "open_food_facts",
    name: shared.product_name,
    protein_per_100g: shared.protein_per_100g,
    fat_per_100g: shared.fat_per_100g,
    carbs_per_100g: shared.carbs_per_100g,
    default_grams:
      shared.serving_size_grams && shared.serving_size_grams > 0 ? shared.serving_size_grams : null,
    notes: manual
      ? MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES
      : shared.brand
        ? `OFF: ${shared.brand}`
        : "OFF連携",
    serving_size: shared.serving_size,
    from_restaurant_name: null,
  };
}

/** 登録先の店に同じバーコードの自メニューがあれば返す（編集中のメニュー自身は除外） */
export function findSameRestaurantBarcodeMenu(
  rows: OwnBarcodeMenuMatch[],
  restaurantId: string | null,
  excludeMenuItemId?: string | null
): OwnBarcodeMenuMatch | null {
  if (!restaurantId) return null;
  return (
    rows.find((r) => r.restaurant_id === restaurantId && r.id !== excludeMenuItemId) ?? null
  );
}

/** 値の出どころを1行で説明する文言 */
export function barcodeValueSourceLabel(prefill: BarcodePrefill): string {
  switch (prefill.source) {
    case "own_menu_item":
      return prefill.from_restaurant_name
        ? `前回保存した値（${prefill.from_restaurant_name}）を反映しました`
        : "前回保存した値を反映しました";
    case "shared_manual_entry":
      return "アプリ内の共有登録の値です";
    case "open_food_facts":
      return "Open Food Facts の値です（100gあたり・炭水化物）。ラベルで確認してください";
  }
}
