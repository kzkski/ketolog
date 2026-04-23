import type { MenuItem } from "@/types/database";
import type { PfcGrams } from "@ketolog/types";
import { pfcGramsFromNullablePer100 as pfcFromPer100 } from "@ketolog/domain/pfc";

export { pfcGramsFromNullablePer100 } from "@ketolog/domain/pfc";

/** メニュー行（100g あたり）とグラム数から、その分量の PFC（g）を算出する。 */
export function pfcGramsFromMenuItem(item: MenuItem, grams: number): PfcGrams {
  return pfcFromPer100(
    item.protein_per_100g,
    item.fat_per_100g,
    item.carbs_per_100g,
    grams
  );
}
