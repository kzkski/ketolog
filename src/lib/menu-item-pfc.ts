import type { MenuItem } from "@/types/database";
import type { PfcGrams } from "@ketolog/types";

/** メニュー行（100g あたり）とグラム数から、その分量の PFC（g）を算出する。 */
export function pfcGramsFromMenuItem(item: MenuItem, grams: number): PfcGrams {
  return {
    p: ((item.protein_per_100g ?? 0) * grams) / 100,
    f: ((item.fat_per_100g ?? 0) * grams) / 100,
    c: ((item.carbs_per_100g ?? 0) * grams) / 100,
  };
}

/** 100g あたりの nullable 値とグラム数から PFC（g）を算出する（スナップショット行・カート用）。 */
export function pfcGramsFromNullablePer100(
  proteinPer100: number | null,
  fatPer100: number | null,
  carbsPer100: number | null,
  grams: number
): PfcGrams {
  return {
    p: ((proteinPer100 ?? 0) * grams) / 100,
    f: ((fatPer100 ?? 0) * grams) / 100,
    c: ((carbsPer100 ?? 0) * grams) / 100,
  };
}
