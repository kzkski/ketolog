import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Web `src/lib/menu-group-expanded-storage.ts` と同一キー・同一 shape。
 * 将来 WebView やデータ移行で揃えやすくする。
 */
const STORAGE_KEY = "ketolog.menuGroupExpanded.v1";

/** Web `FAVORITES_TAB_ID` と同じ */
export const MENU_GROUP_FAVORITES_SCOPE = "__ketolog_favorites__";
/** お気に入り横断検索モードの折りたたみスコープ */
export const MENU_GROUP_CROSS_SEARCH_SCOPE = "__ketolog_cross_search__";

type StoredShape = {
  v: 1;
  byScope: Record<string, string[]>;
};

function parseStored(raw: string | null): StoredShape {
  if (!raw) return { v: 1, byScope: {} };
  try {
    const o = JSON.parse(raw) as unknown;
    if (
      o &&
      typeof o === "object" &&
      (o as StoredShape).v === 1 &&
      (o as StoredShape).byScope &&
      typeof (o as StoredShape).byScope === "object"
    ) {
      return o as StoredShape;
    }
  } catch {
    /* ignore */
  }
  return { v: 1, byScope: {} };
}

export async function readMenuGroupExpandedKeysNative(scope: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const data = parseStored(raw);
    const list = data.byScope[scope];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export async function writeMenuGroupExpandedKeysNative(
  scope: string,
  expandedSectionKeys: string[]
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const data = parseStored(raw);
    data.byScope[scope] = [...expandedSectionKeys];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota 等 */
  }
}

/** Web `collapsedMenuGroupsFromStorage` と同じ判定（展開キー配列版） */
export function collapsedMenuGroupsFromExpandedKeys(
  collapsibleSectionKeys: string[],
  scope: string | null,
  expandedKeys: string[]
): Set<string> {
  if (!scope || collapsibleSectionKeys.length <= 1) {
    return new Set();
  }
  const expanded = new Set(
    expandedKeys.filter((k) => collapsibleSectionKeys.includes(k))
  );
  const collapsed = new Set<string>();
  for (const k of collapsibleSectionKeys) {
    if (!expanded.has(k)) collapsed.add(k);
  }
  return collapsed;
}
