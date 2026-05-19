import { describe, expect, it } from "vitest";
import { pfcRatioPercents, pfcTotalKcal, sumPfc } from "./pfc";

describe("pfcRatioPercents", () => {
  const sample = { p: 15, f: 7, c: 1 };

  it("重量比はグラム重量の割合", () => {
    const r = pfcRatioPercents(sample, "gram");
    expect(r.p).toBeCloseTo((15 / 23) * 100);
    expect(r.f).toBeCloseTo((7 / 23) * 100);
    expect(r.c).toBeCloseTo((1 / 23) * 100);
    expect(r.p + r.f + r.c).toBeCloseTo(100);
  });

  it("カロリー比は 4–9–4 基準", () => {
    const r = pfcRatioPercents(sample, "kcal");
    expect(r.p).toBeCloseTo((60 / 127) * 100);
    expect(r.f).toBeCloseTo((63 / 127) * 100);
    expect(r.c).toBeCloseTo((4 / 127) * 100);
    expect(r.p + r.f + r.c).toBeCloseTo(100);
  });

  it("全 0 のとき 0%", () => {
    expect(pfcRatioPercents({ p: 0, f: 0, c: 0 }, "kcal")).toEqual({ p: 0, f: 0, c: 0 });
  });
});

describe("pfcTotalKcal", () => {
  it("4P+9F+4C", () => {
    expect(pfcTotalKcal({ p: 15, f: 7, c: 1 })).toBe(127);
  });
});

describe("sumPfc", () => {
  it("空ならゼロ", () => {
    expect(sumPfc()).toEqual({ p: 0, f: 0, c: 0 });
  });

  it("成分ごとに合算する", () => {
    expect(
      sumPfc(
        { p: 10, f: 20, c: 5 },
        { p: 1, f: 2, c: 3 },
      ),
    ).toEqual({ p: 11, f: 22, c: 8 });
  });
});
