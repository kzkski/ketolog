import type { MenuItem } from "@/types/database";
import { describe, expect, it } from "vitest";
import { compareMenuItemsForListOrder, sortMenuItemsForListOrder } from "./menu-item-sort";

function item(partial: Partial<MenuItem> & Pick<MenuItem, "id" | "name" | "rank">): MenuItem {
  return {
    restaurant_id: "r1",
    protein_per_100g: null,
    fat_per_100g: null,
    carbs_per_100g: null,
    default_grams: 100,
    order_count: 0,
    notes: null,
    group_name: null,
    group_order: 0,
    ...partial,
  };
}

describe("compareMenuItemsForListOrder", () => {
  it("rank が小さい方が先", () => {
    const a = item({ id: "a", name: "いち", rank: 2 });
    const b = item({ id: "b", name: "に", rank: 1 });
    expect(compareMenuItemsForListOrder(a, b)).toBeGreaterThan(0);
  });

  it("rank が同じなら名前で比較", () => {
    const a = item({ id: "a", name: "いちご", rank: 0 });
    const b = item({ id: "b", name: "みかん", rank: 0 });
    expect(compareMenuItemsForListOrder(a, b)).toBeLessThan(0);
  });

  it("created_at でタイブレーク", () => {
    const a = item({ id: "a", name: "同じ", rank: 0, created_at: "2024-01-02T00:00:00Z" });
    const b = item({ id: "b", name: "同じ", rank: 0, created_at: "2024-01-01T00:00:00Z" });
    expect(compareMenuItemsForListOrder(a, b)).toBeGreaterThan(0);
  });

  it("id で最終タイブレーク", () => {
    const a = item({ id: "b", name: "同じ", rank: 0, created_at: "2024-01-01T00:00:00Z" });
    const b = item({ id: "a", name: "同じ", rank: 0, created_at: "2024-01-01T00:00:00Z" });
    expect(compareMenuItemsForListOrder(a, b)).toBeGreaterThan(0);
  });
});

describe("sortMenuItemsForListOrder", () => {
  it("元配列を変えずソートした配列を返す", () => {
    const x = item({ id: "x", name: "後", rank: 2 });
    const y = item({ id: "y", name: "先", rank: 1 });
    const original = [x, y];
    const sorted = sortMenuItemsForListOrder(original);
    expect(original[0]?.id).toBe("x");
    expect(sorted.map((i) => i.id)).toEqual(["y", "x"]);
  });
});
