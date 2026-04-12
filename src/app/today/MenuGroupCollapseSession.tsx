"use client";

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  menuGroupCollapseStorageScope,
  collapsedMenuGroupsFromStorage,
  collapsedMenuGroupsForSsr,
  writeMenuGroupExpandedKeys,
  readMenuGroupExpandedKeys,
  serializeCollapsedMenuGroupsForSnapshot,
  parseCollapsedMenuGroupsSnapshot,
  subscribeMenuGroupExpandedStorage,
} from "@/lib/menu-group-expanded-storage";

type Props = {
  selectedRestaurantIdResolved: string;
  collapsibleMenuSectionKeys: string[];
  children: (p: {
    collapsedGroups: Set<string>;
    toggleMenuGroupCollapsed: (sectionKey: string) => void;
  }) => ReactNode;
};

/**
 * localStorage と同期した折りたたみ状態。
 * useSyncExternalStore + getServerSnapshot で SSR/ハイドレーションとクライアントの storage を一致させる。
 */
export function MenuGroupCollapseSession({
  selectedRestaurantIdResolved,
  collapsibleMenuSectionKeys,
  children,
}: Props) {
  const scope = menuGroupCollapseStorageScope(selectedRestaurantIdResolved);

  const collapsedSnapshot = useSyncExternalStore(
    subscribeMenuGroupExpandedStorage,
    () =>
      serializeCollapsedMenuGroupsForSnapshot(
        collapsedMenuGroupsFromStorage(collapsibleMenuSectionKeys, scope)
      ),
    () =>
      serializeCollapsedMenuGroupsForSnapshot(
        collapsedMenuGroupsForSsr(collapsibleMenuSectionKeys, scope)
      )
  );

  const collapsedGroups = useMemo(
    () => parseCollapsedMenuGroupsSnapshot(collapsedSnapshot),
    [collapsedSnapshot]
  );

  const toggleMenuGroupCollapsed = useCallback(
    (sectionKey: string) => {
      if (!scope || collapsibleMenuSectionKeys.length < 2) return;
      const expandedList = readMenuGroupExpandedKeys(scope).filter((k) =>
        collapsibleMenuSectionKeys.includes(k)
      );
      const expandedSet = new Set(expandedList);
      if (expandedSet.has(sectionKey)) {
        expandedSet.delete(sectionKey);
      } else {
        expandedSet.add(sectionKey);
      }
      writeMenuGroupExpandedKeys(scope, [...expandedSet]);
    },
    [scope, collapsibleMenuSectionKeys]
  );

  return <>{children({ collapsedGroups, toggleMenuGroupCollapsed })}</>;
}
