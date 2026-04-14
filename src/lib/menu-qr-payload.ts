import type { ImportRestaurantItem } from "@/app/today/actions";
import type { MenuItem } from "@/types/database";

export const MENU_QR_PAYLOAD_VERSION = 1 as const;

export type MenuQrPayloadV1 = {
  v: 1;
  kind: "menuItem";
  item: ImportRestaurantItem;
};

export function menuItemToImportItem(m: MenuItem): ImportRestaurantItem {
  return {
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
  };
}

export function buildMenuQrPayloadJson(item: ImportRestaurantItem): string {
  const payload: MenuQrPayloadV1 = {
    v: MENU_QR_PAYLOAD_VERSION,
    kind: "menuItem",
    item,
  };
  return JSON.stringify(payload);
}

function validateImportRestaurantItemShape(item: ImportRestaurantItem): string | null {
  const label = item.name?.trim() || "（無題）";
  if (item.shared_barcode !== undefined && item.shared_barcode !== null && typeof item.shared_barcode !== "string") {
    return `「${label}」の shared_barcode が不正です（文字列またはnull）`;
  }
  if (
    item.standard_food_code !== undefined &&
    item.standard_food_code !== null &&
    (typeof item.standard_food_code !== "string" || !/^\d{5}$/.test(item.standard_food_code))
  ) {
    return `「${label}」の standard_food_code は5桁の数字文字列またはnullにしてください`;
  }
  if (item.rank < 1 || item.rank > 4 || !Number.isInteger(item.rank)) {
    return `「${label}」の rank が不正です（1〜4の整数を指定してください）`;
  }
  if (typeof item.default_grams !== "number" || item.default_grams <= 0) {
    return `「${label}」の default_grams が不正です（1以上の数値を指定してください）`;
  }
  return null;
}

/**
 * メニュー共有 QR（クライアント内 JSON）の解釈。
 * オブジェクトだが v/kind が一致しない場合は失敗（バーコードへフォールバックしない）。
 */
export function parseMenuSharePayload(text: string):
  | { ok: true; item: ImportRestaurantItem }
  | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "QRのデータを読み取れませんでした（JSON形式ではありません）。" };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "QRのデータ形式が不正です。" };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) {
    return { ok: false, error: "このQRは対応していないバージョンです。" };
  }
  if (o.kind !== "menuItem") {
    return { ok: false, error: "このQRはメニュー共有ではありません。" };
  }
  const item = o.item;
  if (!item || typeof item !== "object") {
    return { ok: false, error: "メニューデータが含まれていません。" };
  }
  const it = item as ImportRestaurantItem;
  const err = validateImportRestaurantItemShape(it);
  if (err) return { ok: false, error: err };
  return { ok: true, item: it };
}
