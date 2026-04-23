import NetInfo from "@react-native-community/netinfo";

/**
 * オフライン判定（NetInfo）。`isInternetReachable` が未確定のときはオンライン扱いで試行する。
 */
export async function getIsOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  if (s.isConnected === false) return false;
  if (s.isInternetReachable === false) return false;
  return true;
}

export function isTransientNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; name?: string };
  const m = (e.message ?? "").toLowerCase();
  if (e.name === "TypeError" && m.includes("network")) return true;
  if (m.includes("network request failed")) return true;
  if (m.includes("failed to fetch")) return true;
  if (m.includes("load failed")) return true;
  if (m.includes("timeout")) return true;
  if (m.includes("aborted")) return true;
  return false;
}
