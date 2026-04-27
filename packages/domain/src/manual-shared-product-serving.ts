/**
 * 手動 shared_products 行: メニュー「1回の量 (g)」を serving 列へ反映（Issue #317）。
 */
export function manualSharedProductServingFromDefaultGrams(defaultGrams: number): {
  serving_size: string | null;
  serving_size_grams: number | null;
} {
  if (!Number.isFinite(defaultGrams) || defaultGrams <= 0) {
    return { serving_size: null, serving_size_grams: null };
  }
  const label = defaultGrams % 1 === 0 ? String(defaultGrams) : String(defaultGrams);
  return { serving_size: `${label}g`, serving_size_grams: defaultGrams };
}
