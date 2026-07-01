import { describe, expect, it } from "vitest";
import { per100gFromDisplayValue, resolveNutrientStoredValue } from "./nutrient-input";

describe("per100gFromDisplayValue", () => {
  it("1回分を 100g あたりへ換算する", () => {
    expect(per100gFromDisplayValue("10", "200")).toBe("5");
  });
});

describe("resolveNutrientStoredValue", () => {
  it("raw がある per100g では raw をそのまま使う", () => {
    expect(resolveNutrientStoredValue("per100g", "100", "", "5.2")).toBe("5.2");
  });

  it("raw がある perServing では 100g あたりへ換算する", () => {
    expect(resolveNutrientStoredValue("perServing", "200", "", "10")).toBe("5");
  });

  it("raw がなければ stored を使う", () => {
    expect(resolveNutrientStoredValue("per100g", "100", "3", null)).toBe("3");
  });

  it("raw が空文字でも stored より優先する", () => {
    expect(resolveNutrientStoredValue("per100g", "100", "3", "")).toBe("");
  });
});
