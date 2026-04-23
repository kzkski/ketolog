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
