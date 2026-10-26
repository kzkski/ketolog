import { describe, expect, it } from "vitest";
import {
  barcodeValueSourceLabel,
  findSameRestaurantBarcodeMenu,
  pickLatestOwnMenuItem,
  resolveBarcodePrefill,
  type OwnBarcodeMenuMatch,
  type SharedProductLike,
} from "./barcode-menu-prefill";
import { MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES } from "./shared-product-source";

function own(overrides: Partial<OwnBarcodeMenuMatch> = {}): OwnBarcodeMenuMatch {
  return {
    id: "m1",
    restaurant_id: "r1",
    restaurant_name: "コンビニ",
    name: "サラダチキン（直した名前）",
    protein_per_100g: 24,
    fat_per_100g: 1.2,
    carbs_per_100g: 0.5,
    default_grams: 110,
    notes: "ラベル確認済み",
    updated_at: "2026-10-26T04:00:00+00:00",
    ...overrides,
  };
}

const off: SharedProductLike = {
  product_name: "Salad chicken",
  brand: "Brand",
  protein_per_100g: 23.3,
  fat_per_100g: 1.2,
  carbs_per_100g: 1.4,
  serving_size: "110 g",
  serving_size_grams: 110,
  source: "open_food_facts",
};

describe("resolveBarcodePrefill", () => {
  it("自分のメニューがあれば Open Food Facts より優先する（再スキャンで保存値が出る）", () => {
    const p = resolveBarcodePrefill({ ownMenuItems: [own()], sharedProduct: off });
    expect(p).toEqual({
      source: "own_menu_item",
      name: "サラダチキン（直した名前）",
      protein_per_100g: 24,
      fat_per_100g: 1.2,
      carbs_per_100g: 0.5,
      default_grams: 110,
      notes: "ラベル確認済み",
      serving_size: null,
      from_restaurant_name: "コンビニ",
    });
  });

  it("複数店舗に一致するときは最後に保存したものを使う", () => {
    const p = resolveBarcodePrefill({
      ownMenuItems: [
        own({ id: "old", carbs_per_100g: 1.4, updated_at: "2026-06-01T00:00:00+00:00" }),
        own({ id: "new", restaurant_id: "r2", restaurant_name: "スーパー", carbs_per_100g: 0.8 }),
      ],
      sharedProduct: off,
    });
    expect(p?.carbs_per_100g).toBe(0.8);
    expect(p?.from_restaurant_name).toBe("スーパー");
  });

  it("自分のメニューがなければ Open Food Facts の値と 1回量・メモを使う", () => {
    const p = resolveBarcodePrefill({ ownMenuItems: [], sharedProduct: off });
    expect(p).toMatchObject({
      source: "open_food_facts",
      name: "Salad chicken",
      carbs_per_100g: 1.4,
      default_grams: 110,
      notes: "OFF: Brand",
      serving_size: "110 g",
    });
    expect(
      resolveBarcodePrefill({
        ownMenuItems: [],
        sharedProduct: { ...off, brand: null, serving_size_grams: null },
      })
    ).toMatchObject({ notes: "OFF連携", default_grams: null });
  });

  it("手入力共有の行は共有メモを使う", () => {
    const p = resolveBarcodePrefill({
      ownMenuItems: [],
      sharedProduct: { ...off, source: "manual_entry" },
    });
    expect(p?.source).toBe("shared_manual_entry");
    expect(p?.notes).toBe(MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES);
  });

  it("どちらもなければ null", () => {
    expect(resolveBarcodePrefill({ ownMenuItems: [], sharedProduct: null })).toBeNull();
  });
});

describe("pickLatestOwnMenuItem", () => {
  it("updated_at が同じなら id の大きい方を選ぶ", () => {
    expect(pickLatestOwnMenuItem([own({ id: "a" }), own({ id: "b" })])?.id).toBe("b");
  });

  it("空なら null", () => {
    expect(pickLatestOwnMenuItem([])).toBeNull();
  });
});

describe("findSameRestaurantBarcodeMenu", () => {
  const rows = [own({ id: "m1", restaurant_id: "r1" }), own({ id: "m2", restaurant_id: "r2" })];

  it("登録先と同じ店のメニューを返す", () => {
    expect(findSameRestaurantBarcodeMenu(rows, "r2")?.id).toBe("m2");
  });

  it("別の店しかなければ null", () => {
    expect(findSameRestaurantBarcodeMenu(rows, "r3")).toBeNull();
  });

  it("編集中のメニュー自身は除外する", () => {
    expect(findSameRestaurantBarcodeMenu(rows, "r1", "m1")).toBeNull();
  });

  it("登録先がなければ null", () => {
    expect(findSameRestaurantBarcodeMenu(rows, null)).toBeNull();
  });
});

describe("barcodeValueSourceLabel", () => {
  it("自分のメニュー由来は店名を出す", () => {
    const p = resolveBarcodePrefill({ ownMenuItems: [own()], sharedProduct: null })!;
    expect(barcodeValueSourceLabel(p)).toBe("前回保存した値（コンビニ）を反映しました");
  });
});
