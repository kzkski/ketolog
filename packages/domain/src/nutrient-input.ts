export type NutrientInputMode = "per100g" | "perServing";

/** 1回分表示値を 100g あたりの保存用文字列へ変換する */
export function per100gFromDisplayValue(displayValue: string, gramsStr: string): string {
  const v = parseFloat(displayValue);
  const g = parseFloat(gramsStr);
  if (isNaN(v) || isNaN(g) || g === 0) return displayValue;
  return parseFloat((v * 100 / g).toFixed(2)).toString();
}

/**
 * 未確定の raw 入力があれば保存用の per100g 文字列へ解決する。
 * onBlur 前に保存しても、画面上の入力値がペイロードに反映される。
 */
export function resolveNutrientStoredValue(
  mode: NutrientInputMode,
  gramsStr: string,
  stored: string,
  raw: string | null,
): string {
  if (raw !== null) {
    const trimmed = raw.trim();
    return mode === "per100g" ? trimmed : per100gFromDisplayValue(trimmed, gramsStr);
  }
  return stored;
}
