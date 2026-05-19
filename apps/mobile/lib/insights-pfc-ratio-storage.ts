import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PfcRatioBasis } from "@ketolog/domain/pfc";

/** Web `src/lib/insights-pfc-ratio-storage.ts` と同一キー */
const STORAGE_KEY = "ketolog.insightsPfcRatioBasis.v1";

const DEFAULT_BASIS: PfcRatioBasis = "kcal";

function parseBasis(raw: string | null): PfcRatioBasis {
  if (raw === "kcal" || raw === "gram") return raw;
  return DEFAULT_BASIS;
}

export async function readInsightsPfcRatioBasisNative(): Promise<PfcRatioBasis> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return parseBasis(raw);
  } catch {
    return DEFAULT_BASIS;
  }
}

export async function writeInsightsPfcRatioBasisNative(basis: PfcRatioBasis): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, basis);
  } catch {
    /* quota 等 */
  }
}
