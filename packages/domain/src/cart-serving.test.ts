import { describe, expect, it } from "vitest";
import {
  canHalveGrams,
  decrementCount,
  formatCount,
  formatGramsShort,
  halveGrams,
  incrementCount,
  isRemovableCount,
  MIN_GRAMS,
  roundGrams,
  toggleHalfCount,
  totalGramsForLine,
} from "./cart-serving";

describe("roundGrams / halveGrams", () => {
  it("小数第1位に丸める", () => {
    expect(roundGrams(52.54)).toBe(52.5);
    expect(roundGrams(52.55)).toBe(52.6);
  });

  it("半分にする", () => {
    expect(halveGrams(105)).toBe(52.5);
    expect(halveGrams(52.5)).toBe(26.3);
    expect(halveGrams(200)).toBe(100);
  });

  it("下限でクランプ", () => {
    expect(halveGrams(0.1)).toBe(MIN_GRAMS);
    expect(halveGrams(0.15)).toBe(MIN_GRAMS);
    expect(canHalveGrams(0.2)).toBe(false);
    expect(canHalveGrams(0.3)).toBe(true);
  });
});

describe("formatGramsShort", () => {
  it("整数と小数", () => {
    expect(formatGramsShort(150)).toBe("150");
    expect(formatGramsShort(52.5)).toBe("52.5");
  });
});

describe("count transitions", () => {
  it("increment: 0.5 → 1、整数は +1", () => {
    expect(incrementCount(0.5)).toBe(1);
    expect(incrementCount(1)).toBe(2);
    expect(incrementCount(2)).toBe(3);
  });

  it("decrement: 1/0.5 → 0（削除）、それ以外は −1", () => {
    expect(decrementCount(0.5)).toBe(0);
    expect(decrementCount(1)).toBe(0);
    expect(decrementCount(2)).toBe(1);
    expect(isRemovableCount(0)).toBe(true);
    expect(isRemovableCount(1)).toBe(false);
  });

  it("toggleHalfCount: 0.5 ↔ 1", () => {
    expect(toggleHalfCount(0.5)).toBe(1);
    expect(toggleHalfCount(1)).toBe(0.5);
    expect(toggleHalfCount(3)).toBe(0.5);
  });

  it("formatCount", () => {
    expect(formatCount(0.5)).toBe("0.5");
    expect(formatCount(2)).toBe("2");
  });
});

describe("totalGramsForLine", () => {
  it("1回 × 回数を丸める", () => {
    expect(totalGramsForLine({ gramsPerServing: 105, count: 1 })).toBe(105);
    expect(totalGramsForLine({ gramsPerServing: 105, count: 0.5 })).toBe(52.5);
    expect(totalGramsForLine({ gramsPerServing: 52.5, count: 2 })).toBe(105);
  });
});
