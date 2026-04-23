import { describe, expect, it } from "vitest";
import {
  addDaysJst,
  eachDate,
  formatNavDate,
  getTokyoHourMinute,
  toJstDateString,
} from "./date";

describe("addDaysJst", () => {
  it("翌日へ進む", () => {
    expect(addDaysJst("2024-01-01", 1)).toBe("2024-01-02");
  });

  it("月末をまたぐ", () => {
    expect(addDaysJst("2024-01-31", 1)).toBe("2024-02-01");
  });

  it("負の日数で戻る", () => {
    expect(addDaysJst("2024-03-01", -1)).toBe("2024-02-29");
  });
});

describe("eachDate", () => {
  it("開始・終了を含む連続日付を返す", () => {
    expect(eachDate("2024-01-01", "2024-01-03")).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("同一日のみ", () => {
    expect(eachDate("2024-06-15", "2024-06-15")).toEqual(["2024-06-15"]);
  });
});

describe("toJstDateString", () => {
  it("UTC 時刻を JST の暦日に変換する", () => {
    expect(toJstDateString(new Date("2023-12-31T15:00:00.000Z"))).toBe("2024-01-01");
    expect(toJstDateString(new Date("2024-06-15T14:59:59.999Z"))).toBe("2024-06-15");
    expect(toJstDateString(new Date("2024-06-15T15:00:00.000Z"))).toBe("2024-06-16");
  });
});

describe("getTokyoHourMinute", () => {
  it("東京の時分を返す", () => {
    expect(getTokyoHourMinute(new Date("2024-06-01T10:30:00.000Z"))).toEqual({ hour: 19, minute: 30 });
  });
});

describe("formatNavDate", () => {
  it("今日と一致するとプレフィックスが付く", () => {
    expect(formatNavDate("2024-06-15", "2024-06-15")).toMatch(/^今日 /);
  });

  it("別日では今日プレフィックスが付かない", () => {
    expect(formatNavDate("2024-06-15", "2024-06-16")).not.toMatch(/^今日 /);
    expect(formatNavDate("2024-06-15", "2024-06-16")).toContain("6/15");
    expect(formatNavDate("2024-06-15", "2024-06-16")).toContain("（");
  });

  it("曜日はロケールに依存せず日本語1文字になる", () => {
    // 2026-04-23 は木曜
    expect(formatNavDate("2026-04-23", "2026-04-24")).toContain("（木）");
  });
});
