import { describe, expect, it } from "vitest";
import { semverCompare } from "./semver-compare";

describe("semverCompare", () => {
  it("等しいと 0", () => {
    expect(semverCompare("1.2.3", "1.2.3")).toBe(0);
  });

  it("メジャーが大きい方が新しい", () => {
    expect(semverCompare("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(semverCompare("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  it("欠けたセグメントは 0 扱い", () => {
    expect(semverCompare("1", "1.0.0")).toBe(0);
    expect(semverCompare("1.0.1", "1")).toBeGreaterThan(0);
  });

  it("非数セグメントは 0 として扱う", () => {
    expect(semverCompare("1.x.0", "1.0.0")).toBe(0);
  });
});
