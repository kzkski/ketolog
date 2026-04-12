"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  menuGroupCollapseStorageScope,
  collapsedMenuGroupsFromStorage,
  writeMenuGroupExpandedKeys,
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
 * タブ／グループ構成が変わったときに key 付きで再マウントし、
 * localStorage から初期折りたたみ状態を読み直す（親の effect で setState しない）。
 */
export function MenuGroupCollapseSession({
  selectedRestaurantIdResolved,
  collapsibleMenuSectionKeys,
  children,
}: Props) {
  const scope = menuGroupCollapseStorageScope(selectedRestaurantIdResolved);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    collapsedMenuGroupsFromStorage(collapsibleMenuSectionKeys, scope)
  );

  const toggleMenuGroupCollapsed = useCallback(
    (sectionKey: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(sectionKey)) next.delete(sectionKey);
        else next.add(sectionKey);
        if (scope && collapsibleMenuSectionKeys.length >= 2) {
          const expanded = collapsibleMenuSectionKeys.filter((k) => !next.has(k));
          writeMenuGroupExpandedKeys(scope, expanded);
        }
        return next;
      });
    },
    [scope, collapsibleMenuSectionKeys]
  );

  return <>{children({ collapsedGroups, toggleMenuGroupCollapsed })}</>;
}
