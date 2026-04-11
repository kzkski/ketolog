/**
 * メニュー一覧行の P/F ハイライト閾値（日次目標の割合 OR 100g あたり濃度）。
 * 糖質（C）はハイライトしない。
 */

/** 1回分が日次タンパク目標のこの割合以上なら P をハイライト */
const HIGHLIGHT_RATIO_P = 0.22;
/** 1回分が日次脂質目標のこの割合以上なら F をハイライト */
const HIGHLIGHT_RATIO_F = 0.22;

/** 100g あたりタンパクがこの値以上なら P をハイライト */
const HIGHLIGHT_PER100_P = 22;
/** 100g あたり脂質がこの値以上なら F をハイライト */
const HIGHLIGHT_PER100_F = 18;

/** 上部 PFC バーと一覧の色を揃える（C はバー専用） */
export const MACRO_BAR_BG = {
  p: "bg-blue-500",
  f: "bg-yellow-500",
  c: "bg-emerald-500",
} as const;

export const MACRO_MENU_TEXT = {
  p: "text-blue-400",
  f: "text-yellow-400",
} as const;

export type MacroHighlightTargets = {
  protein_target_g: number;
  fat_target_g: number;
};

export function menuRowMacroHighlights(
  serving: { p: number; f: number },
  item: {
    protein_per_100g: number | null;
    fat_per_100g: number | null;
  },
  targets: MacroHighlightTargets
): { highlightP: boolean; highlightF: boolean } {
  if (item.protein_per_100g === null) {
    return { highlightP: false, highlightF: false };
  }

  const tp = Math.max(targets.protein_target_g, 1e-9);
  const tf = Math.max(targets.fat_target_g, 1e-9);

  const byRatioP = serving.p / tp >= HIGHLIGHT_RATIO_P;
  const byRatioF = serving.f / tf >= HIGHLIGHT_RATIO_F;

  const byDensityP = (item.protein_per_100g ?? 0) >= HIGHLIGHT_PER100_P;
  const byDensityF = (item.fat_per_100g ?? 0) >= HIGHLIGHT_PER100_F;

  return {
    highlightP: byRatioP || byDensityP,
    highlightF: byRatioF || byDensityF,
  };
}
