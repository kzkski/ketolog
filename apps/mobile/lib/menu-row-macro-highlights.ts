/**
 * Web `src/lib/macroHighlights.ts` と同じ閾値・判定（メニュー行の P/F 強調）。
 */

const HIGHLIGHT_RATIO_P = 0.22;
const HIGHLIGHT_RATIO_F = 0.22;
const HIGHLIGHT_PER100_P = 22;
const HIGHLIGHT_PER100_F = 18;

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
