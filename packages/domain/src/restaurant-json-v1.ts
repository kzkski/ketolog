/**
 * Ketolog 単一店舗 JSON（v1）のエクスポート／パース。
 * Web `TodayClient.tsx` の `EXPORT_SCHEMA` / `downloadRestaurantJson` / `parseSingleRestaurantJson` と同一仕様。
 */
import type { MenuShareImportItem } from "./menu-share-qr";

/** Web `EXPORT_SCHEMA` と同一 */
export const RESTAURANT_JSON_EXPORT_SCHEMA = {
  _schema: {
    description: "Ketolog restaurant export v1 — このファイルをそのまま編集してインポートできます",
    name: "string (必須, 最大50文字) — お店の名前",
    category:
      "string (必須) — external（外食）/ homemade（自炊）/ convenience（コンビニ）/ other（その他）のいずれか",
    "menuItems[].name": "string (必須, 最大100文字) — メニューアイテム名",
    "menuItems[].protein_per_100g": "number or null — 100gあたりタンパク質 (g)",
    "menuItems[].fat_per_100g": "number or null — 100gあたり脂質 (g)",
    "menuItems[].carbs_per_100g": "number or null — 100gあたり糖質 (g)",
    "menuItems[].shared_barcode": "string or null — 市販品参照バーコード（OFF連携時）",
    "menuItems[].standard_food_code": "string or null — 文科省標準成分表の食品番号（5桁）",
    "menuItems[].default_grams": "number (必須, 1以上) — 1回分のデフォルト重量 (g)",
    "menuItems[].rank": "1〜4の整数 (必須) — 1=◎最優先 / 2=○通常 / 3=△控えめ / 4=✕避ける",
    "menuItems[].notes": "string or null — メモ（任意）",
    "menuItems[].group": "string or null — グループ名（任意。同じ値のアイテムがまとめて表示されます）",
  },
} as const;

export type SingleRestaurantJsonPayload = {
  version: number;
  name: string;
  category: string;
  menuItems: MenuShareImportItem[];
};

export type RestaurantJsonMenuRow = {
  restaurant_id: string;
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

/** Web `downloadRestaurantJson` が組み立てるオブジェクトと同一構造 */
export function buildRestaurantExportDocument(
  restaurant: { id: string; name: string; category: string },
  menuItems: RestaurantJsonMenuRow[]
): Record<string, unknown> {
  return {
    version: 1,
    ...RESTAURANT_JSON_EXPORT_SCHEMA,
    name: restaurant.name,
    category: restaurant.category,
    menuItems: menuItems
      .filter((m) => m.restaurant_id === restaurant.id)
      .map((m) => ({
        name: m.name,
        protein_per_100g: m.protein_per_100g,
        fat_per_100g: m.fat_per_100g,
        carbs_per_100g: m.carbs_per_100g,
        shared_barcode: m.shared_barcode ?? null,
        standard_food_code: m.standard_food_code ?? null,
        default_grams: m.default_grams,
        rank: m.rank,
        notes: m.notes,
        group: m.group_name,
      })),
  };
}

/** Web `downloadTemplate` のペイロードと同一 */
export function buildRestaurantTemplateDocument(): Record<string, unknown> {
  return {
    version: 1,
    ...RESTAURANT_JSON_EXPORT_SCHEMA,
    _prompt_hint:
      "このJSONテンプレートに従って [お店名] のメニューを作成してください。rankの基準: ケトジェニックダイエット視点で、糖質が少なく脂質・タンパク質が豊富なものを1（最優先）、糖質が多いものや避けるべきものを4（避ける）としてください。default_gramsは1人前の一般的な提供量（g）を入れてください。栄養素は100gあたりの値で入力してください。",
    name: "お店の名前をここに入力",
    category: "external",
    menuItems: [
      {
        name: "メニュー名",
        protein_per_100g: null,
        fat_per_100g: null,
        carbs_per_100g: null,
        shared_barcode: null,
        standard_food_code: null,
        default_grams: 100,
        rank: 2,
        notes: null,
        group: null,
      },
    ],
  };
}

/** Web `parseSingleRestaurantJson` と同一 */
export function parseSingleRestaurantJson(
  text: string
): SingleRestaurantJsonPayload | { error: string } {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw.version || typeof raw.name !== "string" || !Array.isArray(raw.menuItems)) {
      return { error: "フォーマットが正しくありません（version / name / menuItems が必要です）" };
    }
    const invalidItems = (raw.menuItems as MenuShareImportItem[])
      .map((item, i) => {
        if (
          item.shared_barcode !== undefined &&
          item.shared_barcode !== null &&
          typeof item.shared_barcode !== "string"
        ) {
          return `${i + 1}番目「${item.name}」の shared_barcode が不正です（文字列またはnull）`;
        }
        if (
          item.standard_food_code !== undefined &&
          item.standard_food_code !== null &&
          (typeof item.standard_food_code !== "string" || !/^\d{5}$/.test(item.standard_food_code))
        ) {
          return `${i + 1}番目「${item.name}」の standard_food_code は5桁の数字文字列またはnullにしてください`;
        }
        if (item.rank < 1 || item.rank > 4 || !Number.isInteger(item.rank)) {
          return `${i + 1}番目「${item.name}」の rank が不正です（1〜4の整数を指定してください）`;
        }
        if (typeof item.default_grams !== "number" || item.default_grams <= 0) {
          return `${i + 1}番目「${item.name}」の default_grams が不正です（1以上の数値を指定してください）`;
        }
        return null;
      })
      .filter(Boolean);
    if (invalidItems.length > 0) return { error: invalidItems.join("\n") };
    return raw as SingleRestaurantJsonPayload;
  } catch {
    return { error: "JSONの解析に失敗しました。ファイルの形式を確認してください。" };
  }
}
