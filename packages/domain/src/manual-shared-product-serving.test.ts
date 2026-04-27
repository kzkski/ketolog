import { describe, expect, it } from "vitest";
import { manualSharedProductServingFromDefaultGrams } from "./manual-shared-product-serving";

describe("manualSharedProductServingFromDefaultGrams", () => {
  it("maps positive grams to label and numeric grams", () => {
    expect(manualSharedProductServingFromDefaultGrams(150)).toEqual({
      serving_size: "150g",
      serving_size_grams: 150,
    });
  });

  it("returns nulls for non-positive or non-finite", () => {
    expect(manualSharedProductServingFromDefaultGrams(0)).toEqual({
      serving_size: null,
      serving_size_grams: null,
    });
    expect(manualSharedProductServingFromDefaultGrams(NaN)).toEqual({
      serving_size: null,
      serving_size_grams: null,
    });
  });
});
