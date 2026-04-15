import { describe, expect, it } from "vitest";
import { getMealTypeForTimeZone } from "./meal-timezone";

describe("getMealTypeForTimeZone", () => {
  const tz = "Asia/Tokyo";

  it("朝食帯", () => {
    expect(getMealTypeForTimeZone(new Date("2024-01-01T07:00:00+09:00"), tz)).toBe("breakfast");
    expect(getMealTypeForTimeZone(new Date("2024-01-01T09:59:00+09:00"), tz)).toBe("breakfast");
  });

  it("昼食帯", () => {
    expect(getMealTypeForTimeZone(new Date("2024-01-01T10:00:00+09:00"), tz)).toBe("lunch");
    expect(getMealTypeForTimeZone(new Date("2024-01-01T14:59:00+09:00"), tz)).toBe("lunch");
  });

  it("夕食帯", () => {
    expect(getMealTypeForTimeZone(new Date("2024-01-01T15:00:00+09:00"), tz)).toBe("dinner");
    expect(getMealTypeForTimeZone(new Date("2024-01-01T21:59:00+09:00"), tz)).toBe("dinner");
  });

  it("間食帯", () => {
    expect(getMealTypeForTimeZone(new Date("2024-01-01T05:00:00+09:00"), tz)).toBe("snack");
    expect(getMealTypeForTimeZone(new Date("2024-01-01T22:00:00+09:00"), tz)).toBe("snack");
  });
});
