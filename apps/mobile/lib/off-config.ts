import Constants from "expo-constants";
import { getDefaultOffUserAgent } from "@ketolog/domain/open-food-facts";

/** Open Food Facts 取得オプション（Web の `OFF_API_BASE` / UA に相当） */
export function getMobileOffFetchOptions(): { apiBase?: string; userAgent: string } {
  const extra = Constants.expoConfig?.extra as { offApiBase?: string } | undefined;
  return {
    apiBase: typeof extra?.offApiBase === "string" ? extra.offApiBase : undefined,
    userAgent: getDefaultOffUserAgent(Constants.expoConfig?.version ?? "1.0.0"),
  };
}
