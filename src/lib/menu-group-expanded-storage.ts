/**
 * メニュー見出しグループの「開いている」sectionKey を端末に保存する。
 * TodayClient の FAVORITES_TAB_ID / MEXT_COMPOSITION_TAB_ID と値を揃えること。
 */
const STORAGE_KEY = "ketolog.menuGroupExpanded.v1";

/** @see FAVORITES_TAB_ID in TodayClient */
const FAVORITES_TAB_ID = "__ketolog_favorites__";
/** @see MEXT_COMPOSITION_TAB_ID in TodayClient */
const MEXT_COMPOSITION_TAB_ID = "__ketolog_mext_std__";

type StoredShape = {
  v: 1;
  /** スコープ ID → 展開中の sectionKey（g:… / favg:…） */
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

/** メニュー折りたたみ状態を保存するスコープ。成分表タブなどは null */
export function menuGroupCollapseStorageScope(resolvedTabId: string): string | null {
  if (!resolvedTabId || resolvedTabId === MEXT_COMPOSITION_TAB_ID) return null;
  if (resolvedTabId === FAVORITES_TAB_ID) return FAVORITES_TAB_ID;
  return resolvedTabId;
}

export function readMenuGroupExpandedKeys(scope: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = parseStored(window.localStorage.getItem(STORAGE_KEY));
    const list = data.byScope[scope];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function writeMenuGroupExpandedKeys(scope: string, expandedSectionKeys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const data = parseStored(window.localStorage.getItem(STORAGE_KEY));
    data.byScope[scope] = [...expandedSectionKeys];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/**
 * 現在のメニュー構成と保存済み展開キーから collapsedGroups（閉じているキーの Set）を求める。
 * 折りたたみ対象が 1 つ以下のときは常に空 Set（すべて展開）。
 */
export function collapsedMenuGroupsFromStorage(
  collapsibleSectionKeys: string[],
  scope: string | null
): Set<string> {
  if (!scope || collapsibleSectionKeys.length <= 1) {
    return new Set();
  }
  const expanded = new Set(
    readMenuGroupExpandedKeys(scope).filter((k) => collapsibleSectionKeys.includes(k))
  );
  const collapsed = new Set<string>();
  for (const k of collapsibleSectionKeys) {
    if (!expanded.has(k)) collapsed.add(k);
  }
  return collapsed;
}
