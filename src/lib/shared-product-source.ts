/** `shared_products.source` — 英語スネークケース（Issue #191）。マジックストリング禁止用。 */
export const SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS = "open_food_facts" as const;
export const SHARED_PRODUCT_SOURCE_MANUAL_ENTRY = "manual_entry" as const;

export type SharedProductSource =
  | typeof SHARED_PRODUCT_SOURCE_OPEN_FOOD_FACTS
  | typeof SHARED_PRODUCT_SOURCE_MANUAL_ENTRY;

/** メニュー `notes` 初期値（OFF 由来でないことが利用者に伝わる文言）。 */
export const MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES =
  "アプリ内の手入力（Open Food Facts 未登録。他の利用者と共有されます）";
