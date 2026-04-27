import { describe, expect, it, vi } from "vitest";
import { fetchOpenFoodFactsProduct, normalizeBarcode } from "./open-food-facts";

describe("normalizeBarcode", () => {
  it("strips non-digits", () => {
    expect(normalizeBarcode("  123-45-6  ")).toBe("123456");
  });

  it("returns empty when no digits", () => {
    expect(normalizeBarcode("abc")).toBe("");
  });
});

describe("fetchOpenFoodFactsProduct", () => {
  it("requests serving_size in fields and maps nutriments + serving to product", async () => {
    const mockJson = {
      status: 1,
      product: {
        product_name:  "Protein bar",
        brands:        "B",
        serving_size:  "30 g",
        nutriments:    {
          proteins_100g:        20,
          fat_100g:              10,
          carbohydrates_100g:   15,
        },
      },
    };
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const reqUrl = String(input);
      expect(reqUrl).toContain("serving_size");
      expect(reqUrl).toContain("4000000000");
      return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve(mockJson),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchImpl);

    try {
      const p = await fetchOpenFoodFactsProduct("4000000000", { userAgent: "Ketolog/test" });
      expect(p).not.toBeNull();
      expect(p!.product_name).toBe("Protein bar");
      expect(p!.serving_size).toBe("30 g");
      expect(p!.serving_size_grams).toBe(30);
      expect(p!.protein_per_100g).toBe(20);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
