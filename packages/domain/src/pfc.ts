/**
 * PFC（タンパク / 脂質 / 糖質）の gram 値を成分単位で扱う。
 * DB や画面の `protein` / `fat` / `carbs` などとはキー名が異なるため、呼び出し側でマッピングする。
 */
export type PfcGrams = {
  p: number;
  f: number;
  c: number;
};

/** 複数の PFC を成分ごとに合算する（純粋関数）。 */
export function sumPfc(...parts: PfcGrams[]): PfcGrams {
  let p = 0;
  let f = 0;
  let c = 0;
  for (const part of parts) {
    p += part.p;
    f += part.f;
    c += part.c;
  }
  return { p, f, c };
}

/** 100g あたり（nullable は 0 扱い）と分量 g から、その分量の PFC（g）を算出する。 */
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

/** 表示栄養の一般的な PFC 換算（kcal/g） */
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_FAT = 9;
export const KCAL_PER_G_CARBS = 4;

export type PfcRatioBasis = "kcal" | "gram";

export type PfcRatioPercents = {
  p: number;
  f: number;
  c: number;
};

/** 各マクロの kcal 内訳（キーは gram と同じ p/f/c）。 */
export function pfcKcal(grams: PfcGrams): PfcGrams {
  return {
    p: grams.p * KCAL_PER_G_PROTEIN,
    f: grams.f * KCAL_PER_G_FAT,
    c: grams.c * KCAL_PER_G_CARBS,
  };
}

export function pfcTotalKcal(grams: PfcGrams): number {
  const k = pfcKcal(grams);
  return k.p + k.f + k.c;
}

/** 重量比またはカロリー比（4–9–4）の P/F/C 比率（%）。合計 0 のときはすべて 0。 */
export function pfcRatioPercents(grams: PfcGrams, basis: PfcRatioBasis): PfcRatioPercents {
  const weights = basis === "gram" ? grams : pfcKcal(grams);
  const total = weights.p + weights.f + weights.c;
  if (total <= 0) return { p: 0, f: 0, c: 0 };
  return {
    p: (weights.p / total) * 100,
    f: (weights.f / total) * 100,
    c: (weights.c / total) * 100,
  };
}

/** 比率バー用の flex 比（合計 0 のときはすべて 0）。 */
export function pfcRatioFlex(grams: PfcGrams, basis: PfcRatioBasis): PfcRatioPercents {
  const pct = pfcRatioPercents(grams, basis);
  const scale = 100;
  return {
    p: pct.p / scale,
    f: pct.f / scale,
    c: pct.c / scale,
  };
}
