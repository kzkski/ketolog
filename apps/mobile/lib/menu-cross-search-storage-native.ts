import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ketolog.favoritesCrossSearch.v1";

export async function readFavoritesCrossSearchEnabledNative(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function writeFavoritesCrossSearchEnabledNative(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* quota 等 */
  }
}
