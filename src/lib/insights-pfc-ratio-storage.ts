import type { PfcRatioBasis } from "@ketolog/domain/pfc";

/** Web / Mobile で同一キー（`apps/mobile/lib/insights-pfc-ratio-storage.ts`） */
export const INSIGHTS_PFC_RATIO_BASIS_STORAGE_KEY = "ketolog.insightsPfcRatioBasis.v1";

const DEFAULT_BASIS: PfcRatioBasis = "kcal";

function parseBasis(raw: string | null): PfcRatioBasis {
  if (raw === "kcal" || raw === "gram") return raw;
  return DEFAULT_BASIS;
}

/** SSR 時はデフォルト（カロリー比）を返す。 */
export function readInsightsPfcRatioBasis(): PfcRatioBasis {
  if (typeof window === "undefined") return DEFAULT_BASIS;
  try {
    return parseBasis(window.localStorage.getItem(INSIGHTS_PFC_RATIO_BASIS_STORAGE_KEY));
  } catch {
    return DEFAULT_BASIS;
  }
}

export function writeInsightsPfcRatioBasis(basis: PfcRatioBasis): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSIGHTS_PFC_RATIO_BASIS_STORAGE_KEY, basis);
  } catch {
    /* quota 等 */
  }
}
