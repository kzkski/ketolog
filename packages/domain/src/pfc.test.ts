import { describe, expect, it } from "vitest";
import { sumPfc } from "./pfc";

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
