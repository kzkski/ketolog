import { describe, expect, it } from "vitest";
import { normalizeBarcode } from "./open-food-facts";

describe("normalizeBarcode", () => {
  it("strips non-digits", () => {
    expect(normalizeBarcode("  123-45-6  ")).toBe("123456");
  });

  it("returns empty when no digits", () => {
    expect(normalizeBarcode("abc")).toBe("");
  });
});
