/**
 * メニュー見出しグループの「開いている」sectionKey を端末に保存する。
 * TodayClient の FAVORITES_TAB_ID / MEXT_COMPOSITION_TAB_ID と値を揃えること。
 */
const STORAGE_KEY = "ketolog.menuGroupExpanded.v1";

/** 同一タブ内の書き込み後に useSyncExternalStore を更新する */
export const MENU_GROUP_EXPANDED_STORAGE_EVENT = "ketolog:menu-group-expanded-storage";

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
    window.dispatchEvent(new Event(MENU_GROUP_EXPANDED_STORAGE_EVENT));
  } catch {
    /* quota / private mode */
  }
}

/**
 * SSR / ハイドレーション用: localStorage を読まず、複数グループ時は「すべて閉じる」前提の Set。
 * （サーバー出力と getServerSnapshot を一致させる）
 */
export function collapsedMenuGroupsForSsr(
  collapsibleSectionKeys: string[],
  scope: string | null
): Set<string> {
  if (!scope || collapsibleSectionKeys.length <= 1) {
    return new Set();
  }
  return new Set(collapsibleSectionKeys);
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

/** useSyncExternalStore 用。Object.is で安定比較できる文字列化 */
export function serializeCollapsedMenuGroupsForSnapshot(s: Set<string>): string {
  return JSON.stringify([...s].sort());
}

export function parseCollapsedMenuGroupsSnapshot(serialized: string): Set<string> {
  try {
    const arr = JSON.parse(serialized) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** useSyncExternalStore 用。同一タブの書き込みはカスタムイベントで通知（storage イベントは別タブのみ） */
export function subscribeMenuGroupExpandedStorage(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
  };
  const onLocal = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(MENU_GROUP_EXPANDED_STORAGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MENU_GROUP_EXPANDED_STORAGE_EVENT, onLocal);
  };
}
