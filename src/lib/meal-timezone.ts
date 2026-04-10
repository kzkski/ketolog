export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** 指定タイムゾーンの「現在時刻」の時で、食事区分を推定する（今日ページの日付が Asia/Tokyo 基準であることと揃える） */
export function getMealTypeForTimeZone(date: Date, timeZone: string): MealType {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const h = hourPart ? parseInt(hourPart.value, 10) : 0;
  if (h >= 6 && h < 10) return "breakfast";
  if (h >= 10 && h < 15) return "lunch";
  if (h >= 15 && h < 22) return "dinner";
  return "snack";
}
