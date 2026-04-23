import { describe, expect, it } from "vitest";
import { buildInsights, getPresetRange } from "./insights";

describe("getPresetRange", () => {
  it("returns 7-day window ending on today", () => {
    const r = getPresetRange("2026-04-24", 7);
    expect(r.end).toBe("2026-04-24");
    expect(r.start).toBe("2026-04-18");
  });
});

describe("buildInsights", () => {
  it("aggregates PFC by date and builds top10", () => {
    const insight = buildInsights(
      [
        {
          id: "1",
          date: "2026-04-20",
          meal_type: "lunch",
          eaten_at: "2026-04-20T12:00:00Z",
          item_name: "卵",
          grams: 100,
          protein_g: 10,
          fat_g: 5,
          carbs_g: 1,
          source: "manual",
          menu_item_id: null,
          created_at: "2026-04-20T12:00:01Z",
        },
        {
          id: "2",
          date: "2026-04-20",
          meal_type: "dinner",
          eaten_at: "2026-04-20T18:00:00Z",
          item_name: "卵",
          grams: 50,
          protein_g: 5,
          fat_g: 2,
          carbs_g: 0,
          source: "manual",
          menu_item_id: null,
          created_at: "2026-04-20T18:00:01Z",
        },
      ],
      "2026-04-20",
      "2026-04-20"
    );
    expect(insight.summary.avgProtein).toBeCloseTo(15);
    expect(insight.summary.avgFat).toBeCloseTo(7);
    expect(insight.summary.avgCarbs).toBeCloseTo(1);
    expect(insight.top10).toHaveLength(1);
    expect(insight.top10[0]!.label).toBe("卵");
    expect(insight.top10[0]!.count).toBe(2);
    expect(insight.chart).toHaveLength(1);
    expect(insight.chart[0]!.protein).toBeCloseTo(15);
  });
});
