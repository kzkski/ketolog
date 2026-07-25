/** カート・分量編集で共有する回数 / グラム操作（UI 非依存） */

export const MIN_GRAMS = 0.1;
export const HALF_COUNT = 0.5;

/** 半分ボタンの共通ラベル（Web / Mobile で揃える） */
export const HALF_GRAMS_LABEL = "½";
export const HALF_GRAMS_LABEL_FULL = "½ 半分";
export const HALF_GRAMS_ARIA_LABEL = "グラムを半分にする";
export const HALF_GRAMS_HINT = "現在の分量を半分にします";

export function roundGrams(grams: number): number {
  return Math.round(grams * 10) / 10;
}

/** 現在の g を半分にする。下限 MIN_GRAMS。 */
export function halveGrams(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return MIN_GRAMS;
  return Math.max(MIN_GRAMS, roundGrams(grams / 2));
}

export function canHalveGrams(grams: number): boolean {
  return Number.isFinite(grams) && grams > MIN_GRAMS * 2;
}

/** 整数はそのまま、端数は小数第1位 */
export function formatGramsShort(grams: number): string {
  if (!Number.isFinite(grams)) return "0";
  const r = roundGrams(grams);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * 回数 +1。0.5 のときは 1 に戻し、1.5 は作らない。
 */
export function incrementCount(count: number): number {
  if (count === HALF_COUNT) return 1;
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.floor(count) + 1;
}

/**
 * 回数 −1。1 または 0.5 のときは 0（= 行削除）。
 */
export function decrementCount(count: number): number {
  if (count === HALF_COUNT) return 0;
  if (!Number.isFinite(count) || count <= 1) return 0;
  return Math.floor(count) - 1;
}

/** 0.5 ↔ 1（整数 n≥1 をタップしたら 0.5） */
export function toggleHalfCount(count: number): number {
  if (count === HALF_COUNT) return 1;
  return HALF_COUNT;
}

export function isRemovableCount(count: number): boolean {
  return !Number.isFinite(count) || count <= 0;
}

export function formatCount(count: number): string {
  if (count === HALF_COUNT) return "0.5";
  if (!Number.isFinite(count)) return "1";
  return String(Math.floor(count));
}

export function totalGramsForLine(line: {
  gramsPerServing: number;
  count: number;
}): number {
  return roundGrams(line.gramsPerServing * line.count);
}
