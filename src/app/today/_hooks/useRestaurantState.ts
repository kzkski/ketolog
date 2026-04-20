"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type {
  FavoriteGroupPayload,
  MenuItem,
  Restaurant,
} from "@/types/database";
import { isSnapshotRestaurant } from "@/lib/snapshot-restaurant";
import { sortMenuItemsForListOrder } from "@/lib/menu-item-sort";
import {
  addMenuItemToFavorites,
  removeMenuItemFromFavorites,
} from "../actions/favorites";
import { fetchMenuItemsForRestaurant } from "../actions/menu-item";
import {
  deleteRestaurant,
  reorderRestaurants,
  updateRestaurantName,
} from "../actions/restaurant";
import { TAB_CONTEXT_MENU_H, TAB_CONTEXT_MENU_W } from "../ui-constants";

/** レストランタブではない「お気に入り」集約ビュー */
export const FAVORITES_TAB_ID = "__ketolog_favorites__";

/** 文科省標準成分表検索パネル（仮想タブ） */
export const MEXT_COMPOSITION_TAB_ID = "__ketolog_mext_std__";

function firstTabRestaurantId(restaurants: Restaurant[]): string {
  const visible = restaurants.filter((r) => !isSnapshotRestaurant(r));
  return visible[0]?.id ?? "";
}

function hasFavoriteEntries(groups: FavoriteGroupPayload[]): boolean {
  return groups.some((g) => g.entries.length > 0);
}

/** タブ並びの先頭から、お気に入りメニューが1件でもある店を探す */
function firstRestaurantIdWithFavoriteMenu(
  tabRestaurants: Restaurant[],
  groups: FavoriteGroupPayload[]
): string | undefined {
  if (tabRestaurants.length === 0) return undefined;
  const withFavorite = new Set<string>();
  for (const g of groups) {
    for (const e of g.entries) {
      if (e.menu_item) withFavorite.add(e.menu_item.restaurant_id);
    }
  }
  return tabRestaurants.find((r) => withFavorite.has(r.id))?.id;
}

function sortRestaurants(list: Restaurant[]): Restaurant[] {
  return [...list].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    return b.order_count - a.order_count;
  });
}

export type MenuGroup = {
  sectionKey: string;
  groupName: string | null;
  groupOrder: number;
  items: MenuItem[];
  /** お気に入りタブ用: 行ごとの由来（店名・店内グループ） */
  originByItemId?: Record<string, string>;
};

type RestaurantAddSheet = "choice" | "manual" | "import" | "preset" | null;

type UseRestaurantStateParams = {
  initialRestaurants: Restaurant[];
  initialMenuItems: MenuItem[];
  initialFavoriteGroups: FavoriteGroupPayload[];
  initialLoadedRestaurantIds: string[];
};

export function useRestaurantState({
  initialRestaurants,
  initialMenuItems,
  initialFavoriteGroups,
  initialLoadedRestaurantIds,
}: UseRestaurantStateParams) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialMenuItems);
  const loadedRestaurantIdsRef = useRef<Set<string>>(new Set(initialLoadedRestaurantIds));
  const loadingRestaurantIdsRef = useRef<Set<string>>(new Set());
  const [loadingRestaurantIds, setLoadingRestaurantIds] = useState<Record<string, boolean>>({});
  const [favoriteGroups, setFavoriteGroups] =
    useState<FavoriteGroupPayload[]>(initialFavoriteGroups);
  const [, setMenuLoadTick] = useState(0);
  const [menuLoadErrorByRestaurantId, setMenuLoadErrorByRestaurantId] = useState<Record<string, string>>({});
  /** お気に入りトグルごとの世代。古い非同期結果で state を上書きしない。 */
  const favoriteToggleGenRef = useRef<Map<string, number>>(new Map());
  /** 同一 menu_item_id のサーバー更新を直列化（前段の失敗で後段を止めない）。 */
  const favoriteToggleChainRef = useRef<Map<string, Promise<void>>>(new Map());
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(() =>
    hasFavoriteEntries(initialFavoriteGroups)
      ? FAVORITES_TAB_ID
      : firstTabRestaurantId(initialRestaurants)
  );
  const [compositionTargetRestaurantId, setCompositionTargetRestaurantId] =
    useState("");
  const lastRealRestaurantTabIdRef = useRef<string>("");
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);
  const [confirmDeleteRestaurant, setConfirmDeleteRestaurant] = useState(false);
  const [showImportMenuItems, setShowImportMenuItems] = useState(false);
  const [restaurantTabMenu, setRestaurantTabMenu] = useState<
    null | { restaurant: Restaurant; x: number; y: number }
  >(null);
  const [renameRestaurantTarget, setRenameRestaurantTarget] = useState<Restaurant | null>(null);
  const [renameRestaurantSaving, setRenameRestaurantSaving] = useState(false);
  const [restaurantAddSheet, setRestaurantAddSheet] =
    useState<RestaurantAddSheet>(null);

  const openRestaurantTabMenu = useCallback((r: Restaurant, cx: number, cy: number) => {
    if (typeof window === "undefined") return;
    const x = Math.min(
      window.innerWidth - TAB_CONTEXT_MENU_W - 8,
      Math.max(8, cx)
    );
    const y = Math.min(
      window.innerHeight - TAB_CONTEXT_MENU_H - 8,
      Math.max(8, cy)
    );
    setRestaurantTabMenu({ restaurant: r, x, y });
  }, []);

  useEffect(() => {
    if (!restaurantTabMenu && !renameRestaurantTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRestaurantTabMenu(null);
      setRenameRestaurantTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restaurantTabMenu, renameRestaurantTarget]);

  const submitRestaurantRename = useCallback(async (trimmed: string) => {
    if (!renameRestaurantTarget) return;
    setRenameRestaurantSaving(true);
    const res = await updateRestaurantName(renameRestaurantTarget.id, trimmed);
    setRenameRestaurantSaving(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    if (!res.data) return;
    setRestaurants((prev) =>
      sortRestaurants(prev.map((row) => (row.id === res.data!.id ? res.data! : row)))
    );
    if (res.updatedFavoriteGroupId) {
      setFavoriteGroups((prev) =>
        prev.map((g) =>
          g.id === res.updatedFavoriteGroupId ? { ...g, name: res.data!.name } : g
        )
      );
    }
    setRenameRestaurantTarget(null);
  }, [renameRestaurantTarget]);

  const tabRestaurants = useMemo(
    () => restaurants.filter((r) => !isSnapshotRestaurant(r)),
    [restaurants]
  );

  const selectedRestaurantIdResolved = useMemo(() => {
    if (selectedRestaurantId === FAVORITES_TAB_ID) return FAVORITES_TAB_ID;
    if (selectedRestaurantId === MEXT_COMPOSITION_TAB_ID) {
      return MEXT_COMPOSITION_TAB_ID;
    }
    if (tabRestaurants.length === 0) return "";
    if (tabRestaurants.some((r) => r.id === selectedRestaurantId)) {
      return selectedRestaurantId;
    }
    return tabRestaurants[0].id;
  }, [tabRestaurants, selectedRestaurantId]);

  useEffect(() => {
    if (
      selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
      selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID &&
      selectedRestaurantIdResolved
    ) {
      lastRealRestaurantTabIdRef.current = selectedRestaurantIdResolved;
    }
  }, [selectedRestaurantIdResolved]);

  const resolvedCompositionTargetId = useMemo(() => {
    if (tabRestaurants.length === 0) return "";
    if (
      compositionTargetRestaurantId &&
      tabRestaurants.some((r) => r.id === compositionTargetRestaurantId)
    ) {
      return compositionTargetRestaurantId;
    }
    return tabRestaurants[0]!.id;
  }, [tabRestaurants, compositionTargetRestaurantId]);

  const menuAddRestaurantId = useMemo(() => {
    if (selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID) {
      return resolvedCompositionTargetId;
    }
    if (selectedRestaurantIdResolved === FAVORITES_TAB_ID) {
      return (
        firstRestaurantIdWithFavoriteMenu(tabRestaurants, favoriteGroups) ??
        tabRestaurants[0]?.id ??
        ""
      );
    }
    return selectedRestaurantIdResolved;
  }, [
    selectedRestaurantIdResolved,
    tabRestaurants,
    resolvedCompositionTargetId,
    favoriteGroups,
  ]);

  const selectedRestaurant = restaurants.find(
    (r) => r.id === selectedRestaurantIdResolved
  );
  const selectedRestaurantMenuLoading = Boolean(
    selectedRestaurantIdResolved &&
      selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
      selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID &&
      loadingRestaurantIds[selectedRestaurantIdResolved]
  );
  const selectedRestaurantMenuError =
    selectedRestaurantIdResolved &&
    selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
    selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID
      ? menuLoadErrorByRestaurantId[selectedRestaurantIdResolved] ?? null
      : null;

  const tabRestaurantIds = useMemo(
    () => tabRestaurants.map((r) => r.id),
    [tabRestaurants]
  );

  const restaurantNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of restaurants) m.set(r.id, r.name);
    return m;
  }, [restaurants]);

  const ensureRestaurantMenuLoaded = useCallback(async (restaurantId: string) => {
    if (!restaurantId) return;
    if (loadingRestaurantIdsRef.current.has(restaurantId)) return;
    if (loadedRestaurantIdsRef.current.has(restaurantId)) return;

    loadingRestaurantIdsRef.current.add(restaurantId);
    setLoadingRestaurantIds((prev) => ({ ...prev, [restaurantId]: true }));
    setMenuLoadErrorByRestaurantId((prev) => {
      if (!prev[restaurantId]) return prev;
      const next = { ...prev };
      delete next[restaurantId];
      return next;
    });
    setMenuLoadTick((n) => n + 1);

    const result = await fetchMenuItemsForRestaurant(restaurantId);
    loadingRestaurantIdsRef.current.delete(restaurantId);
    setLoadingRestaurantIds((prev) => {
      if (!prev[restaurantId]) return prev;
      const next = { ...prev };
      delete next[restaurantId];
      return next;
    });

    if (result.error) {
      setMenuLoadErrorByRestaurantId((prev) => ({
        ...prev,
        [restaurantId]: result.error ?? "メニューの取得に失敗しました",
      }));
      setMenuLoadTick((n) => n + 1);
      return;
    }

    loadedRestaurantIdsRef.current.add(restaurantId);
    setMenuItems((prev) => {
      const others = prev.filter((item) => item.restaurant_id !== restaurantId);
      return sortMenuItemsForListOrder([...others, ...(result.data ?? [])]);
    });
    setMenuLoadTick((n) => n + 1);
  }, []);

  const retryLoadSelectedRestaurantMenu = useCallback(async () => {
    if (
      !selectedRestaurantIdResolved ||
      selectedRestaurantIdResolved === FAVORITES_TAB_ID ||
      selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID
    ) {
      return;
    }
    loadedRestaurantIdsRef.current.delete(selectedRestaurantIdResolved);
    await ensureRestaurantMenuLoaded(selectedRestaurantIdResolved);
  }, [ensureRestaurantMenuLoaded, selectedRestaurantIdResolved]);

  useEffect(() => {
    if (
      !selectedRestaurantIdResolved ||
      selectedRestaurantIdResolved === FAVORITES_TAB_ID ||
      selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID
    ) {
      return;
    }
    const tid = window.setTimeout(() => {
      void ensureRestaurantMenuLoaded(selectedRestaurantIdResolved);
    }, 0);
    return () => window.clearTimeout(tid);
  }, [selectedRestaurantIdResolved, ensureRestaurantMenuLoaded]);

  const favoriteMenuItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of favoriteGroups) {
      for (const e of g.entries) s.add(e.menu_item_id);
    }
    return s;
  }, [favoriteGroups]);

  async function handleRestaurantDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabRestaurants.findIndex((r) => r.id === active.id);
    const newIndex = tabRestaurants.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(tabRestaurants, oldIndex, newIndex).map((r, index) => ({
      ...r,
      display_order: index,
    }));
    const previous = restaurants;
    const tabIdSet = new Set(tabRestaurants.map((r) => r.id));
    const rest = restaurants.filter((r) => !tabIdSet.has(r.id));
    setRestaurants([...moved, ...rest]);
    const result = await reorderRestaurants(moved.map((r) => r.id));
    if (result.error) {
      alert(result.error);
      setRestaurants(previous);
    }
  }

  const handleToggleFavorite = useCallback((item: MenuItem) => {
    const id = item.id;
    const myGen = (favoriteToggleGenRef.current.get(id) ?? 0) + 1;
    favoriteToggleGenRef.current.set(id, myGen);

    let snapshotBefore: FavoriteGroupPayload[] | null = null;
    let removeFavorite = false;

    // React 19 では setState の関数更新が直後の行より遅れることがあり、
    // snapshotBefore が未設定のまま return するとサーバーへの保存がスキップされる。
    flushSync(() => {
      setFavoriteGroups((prev) => {
        snapshotBefore = prev;
        const was = prev.some((g) =>
          g.entries.some((e) => e.menu_item_id === id)
        );
        if (was) {
          removeFavorite = true;
          return prev
            .map((g) => ({
              ...g,
              entries: g.entries.filter((e) => e.menu_item_id !== id),
            }))
            .filter((g) => g.entries.length > 0);
        }
        removeFavorite = false;
        const restaurant = restaurants.find((r) => r.id === item.restaurant_id);
        const groupName = restaurant?.name ?? "その他";
        const existingGroup = prev.find((g) => g.name === groupName);
        const tempEntry = {
          id: `temp-${id}`,
          favorite_group_id: existingGroup?.id ?? `temp-group-${id}`,
          menu_item_id: id,
          display_order: existingGroup ? existingGroup.entries.length : 0,
          menu_item: item,
        };
        if (existingGroup) {
          return prev.map((g) =>
            g.id === existingGroup.id ? { ...g, entries: [...g.entries, tempEntry] } : g
          );
        }
        return [
          ...prev,
          {
            id: `temp-group-${id}`,
            name: groupName,
            display_order: prev.length,
            entries: [tempEntry],
          },
        ];
      });
    });

    if (snapshotBefore === null) return;
    const rollbackTarget = snapshotBefore;

    const tail = favoriteToggleChainRef.current.get(id) ?? Promise.resolve();
    const safeTail = tail.catch(() => {});

    const work = async () => {
      const result = removeFavorite
        ? await removeMenuItemFromFavorites(id)
        : await addMenuItemToFavorites(id);

      if (favoriteToggleGenRef.current.get(id) !== myGen) return;

      if (result.error) {
        alert(result.error);
        setFavoriteGroups((prev) => {
          if (favoriteToggleGenRef.current.get(id) !== myGen) return prev;
          return rollbackTarget;
        });
        return;
      }
      if (result.data) setFavoriteGroups(result.data);
    };

    const next = safeTail.then(() => work());
    favoriteToggleChainRef.current.set(id, next);
    void next;
  }, [restaurants]);

  const menuGroups = useMemo((): MenuGroup[] => {
    if (selectedRestaurantIdResolved === FAVORITES_TAB_ID) {
      return favoriteGroups
        .filter((g) => g.entries.length > 0)
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((g) => {
          const originByItemId: Record<string, string> = {};
          const items: MenuItem[] = g.entries
            .slice()
            .sort((x, y) => x.display_order - y.display_order)
            .map((e) => {
              const live = menuItems.find((m) => m.id === e.menu_item_id) ?? e.menu_item;
              if (!live) return null;
              const rname = restaurantNameById.get(live.restaurant_id) ?? "お店";
              const gn = live.group_name?.trim();
              originByItemId[live.id] = gn ? `${rname} · ${gn}` : rname;
              return live;
            })
            .filter((item): item is MenuItem => item !== null);
          return {
            sectionKey: `favg:${g.id}`,
            groupName: g.name,
            groupOrder: g.display_order,
            items,
            originByItemId,
          };
        });
    }

    const items = sortMenuItemsForListOrder(
      menuItems.filter((item) => item.restaurant_id === selectedRestaurantIdResolved)
    );
    const groupMap = new Map<string | null, MenuGroup>();

    for (const item of items) {
      const key = item.group_name;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          sectionKey: key === null ? "ungrouped" : `g:${key}`,
          groupName: key,
          groupOrder: item.group_order,
          items: [],
        });
      }
      groupMap.get(key)!.items.push(item);
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.groupName === null) return -1;
      if (b.groupName === null) return 1;
      return a.groupOrder - b.groupOrder;
    });
  }, [menuItems, selectedRestaurantIdResolved, favoriteGroups, restaurantNameById]);

  const collapsibleMenuSectionKeys = useMemo(
    () => menuGroups.filter((g) => g.groupName !== null).map((g) => g.sectionKey),
    [menuGroups]
  );

  const menuGroupCollapseSessionKey = `${selectedRestaurantIdResolved}\0${collapsibleMenuSectionKeys.join("\0")}`;

  const applyMenuItemSaved = useCallback((saved: MenuItem) => {
    loadedRestaurantIdsRef.current.add(saved.restaurant_id);
    setMenuItems((prev) => {
      const idx = prev.findIndex((m) => m.id === saved.id);
      const next =
        idx >= 0 ? prev.map((m) => (m.id === saved.id ? saved : m)) : [...prev, saved];
      return sortMenuItemsForListOrder(next);
    });
    setFavoriteGroups((prev) =>
      prev.map((g) => ({
        ...g,
        entries: g.entries.map((e) =>
          e.menu_item_id === saved.id ? { ...e, menu_item: saved } : e
        ),
      }))
    );
  }, []);

  const applyMenuItemDeleted = useCallback((id: string) => {
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    setFavoriteGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          entries: g.entries.filter((e) => e.menu_item_id !== id),
        }))
        .filter((g) => g.entries.length > 0)
    );
  }, []);

  const handleDeleteRestaurant = useCallback(async () => {
    if (!selectedRestaurant) return;
    setDeletingRestaurant(true);
    const result = await deleteRestaurant(selectedRestaurant.id);
    if (result.error) {
      alert(result.error);
      setDeletingRestaurant(false);
      return;
    }
    const rid = selectedRestaurant.id;
    loadedRestaurantIdsRef.current.delete(rid);
    loadingRestaurantIdsRef.current.delete(rid);
    setLoadingRestaurantIds((prev) => {
      if (!prev[rid]) return prev;
      const next = { ...prev };
      delete next[rid];
      return next;
    });
    setMenuLoadErrorByRestaurantId((prev) => {
      if (!prev[rid]) return prev;
      const next = { ...prev };
      delete next[rid];
      return next;
    });
    const next = restaurants.filter((r) => r.id !== rid);
    setRestaurants(next);
    setMenuItems((prev) => prev.filter((m) => m.restaurant_id !== rid));
    setFavoriteGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          entries: g.entries.filter((e) => {
            const it = menuItems.find((m) => m.id === e.menu_item_id) ?? e.menu_item;
            if (!it) return false;
            return it.restaurant_id !== rid;
          }),
        }))
        .filter((g) => g.entries.length > 0)
    );
    setSelectedRestaurantId(next[0]?.id ?? "");
    setConfirmDeleteRestaurant(false);
    setDeletingRestaurant(false);
  }, [selectedRestaurant, restaurants, menuItems]);

  const registerManualRestaurant = useCallback((r: Restaurant) => {
    setRestaurants((prev) => sortRestaurants([...prev, r]));
    setSelectedRestaurantId(r.id);
    setRestaurantAddSheet(null);
  }, []);

  const registerImportedRestaurant = useCallback((restaurant: Restaurant, items: MenuItem[]) => {
    loadedRestaurantIdsRef.current.add(restaurant.id);
    setRestaurants((prev) => sortRestaurants([...prev, restaurant]));
    setMenuItems((prev) => sortMenuItemsForListOrder([...prev, ...items]));
    setSelectedRestaurantId(restaurant.id);
    setRestaurantAddSheet(null);
  }, []);

  const registerAdditionalMenuItems = useCallback((items: MenuItem[]) => {
    for (const item of items) {
      loadedRestaurantIdsRef.current.add(item.restaurant_id);
    }
    setMenuItems((prev) => sortMenuItemsForListOrder([...prev, ...items]));
    setShowImportMenuItems(false);
  }, []);

  return {
    restaurants,
    menuItems,
    selectedRestaurantId,
    setSelectedRestaurantId,
    compositionTargetRestaurantId,
    setCompositionTargetRestaurantId,
    lastRealRestaurantTabIdRef,
    deletingRestaurant,
    confirmDeleteRestaurant,
    setConfirmDeleteRestaurant,
    showImportMenuItems,
    setShowImportMenuItems,
    restaurantTabMenu,
    setRestaurantTabMenu,
    renameRestaurantTarget,
    setRenameRestaurantTarget,
    renameRestaurantSaving,
    restaurantAddSheet,
    setRestaurantAddSheet,
    tabRestaurants,
    tabRestaurantIds,
    selectedRestaurantIdResolved,
    resolvedCompositionTargetId,
    menuAddRestaurantId,
    selectedRestaurant,
    selectedRestaurantMenuLoading,
    selectedRestaurantMenuError,
    retryLoadSelectedRestaurantMenu,
    restaurantNameById,
    favoriteMenuItemIds,
    openRestaurantTabMenu,
    submitRestaurantRename,
    handleRestaurantDragEnd,
    handleToggleFavorite,
    menuGroups,
    collapsibleMenuSectionKeys,
    menuGroupCollapseSessionKey,
    applyMenuItemSaved,
    applyMenuItemDeleted,
    handleDeleteRestaurant,
    registerManualRestaurant,
    registerImportedRestaurant,
    registerAdditionalMenuItems,
  };
}
