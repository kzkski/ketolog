"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItem, Restaurant } from "@/types/database";
import {
  buildCrossRestaurantMenuGroups,
  filterMenuGroupsByBrowseQuery,
} from "@/lib/menu-browse-filter";
import { CROSS_SEARCH_SCOPE } from "@/lib/menu-group-expanded-storage";
import {
  readFavoritesCrossSearchEnabled,
  writeFavoritesCrossSearchEnabled,
} from "@/lib/menu-cross-search-storage";
import type { StandardFoodSearchRow } from "../actions/menu-item";
import { StandardFoodPanel } from "../StandardFoodPanel";
import { MenuGroupCollapseSession } from "../MenuGroupCollapseSession";
import type { MenuGroup } from "../_hooks/useRestaurantState";
import { FAVORITES_TAB_ID, MEXT_COMPOSITION_TAB_ID } from "../_hooks/useRestaurantState";
import type { CartEntry } from "./CartPanel";
import { MenuItemRow } from "./MenuItemRow";
import { FavoritesPanel } from "./FavoritesPanel";

export type MenuItemListProps = {
  selectedRestaurantIdResolved: string;
  snapshotRestaurantId: string;
  tabRestaurants: Restaurant[];
  resolvedCompositionTargetId: string;
  onCompositionTargetChange: (id: string) => void;
  onPickStandardFood: (row: StandardFoodSearchRow) => void;
  onOpenItemAddDrawer: (restaurantId: string) => void;
  menuGroupCollapseSessionKey: string;
  collapsibleMenuSectionKeys: string[];
  menuGroups: MenuGroup[];
  menuItems: MenuItem[];
  cart: Map<string, CartEntry>;
  proteinTargetG: number;
  fatTargetG: number;
  onAddItem: (item: MenuItem, grams: number) => void;
  onRemoveItem: (itemId: string) => void;
  onChangeGrams: (itemId: string, grams: number) => void;
  onEditItem: (item: MenuItem) => void;
  onToggleFavorite: (item: MenuItem) => void | Promise<void>;
  favoriteMenuItemIds: Set<string>;
  selectedRestaurant: Restaurant | undefined;
  confirmDeleteRestaurant: boolean;
  deletingRestaurant: boolean;
  onSetConfirmDeleteRestaurant: (v: boolean) => void;
  onOpenImportMenuItems: () => void;
  onDeleteRestaurant: () => void;
  onDownloadRestaurantJson: () => void;
  isSelectedRestaurantMenuLoading: boolean;
  selectedRestaurantMenuError: string | null;
  onRetryLoadSelectedRestaurantMenu: () => void;
  favoriteGroupsLoading: boolean;
  favoriteGroupsError: string | null;
  onRetryLoadFavoriteGroups: () => void;
  allMenusLoading: boolean;
  allMenusError: string | null;
  onEnsureAllMenusLoaded: () => void | Promise<void>;
  onRetryLoadAllMenus: () => void | Promise<void>;
};

export function MenuItemList({
  selectedRestaurantIdResolved,
  snapshotRestaurantId,
  tabRestaurants,
  resolvedCompositionTargetId,
  onCompositionTargetChange,
  onPickStandardFood,
  onOpenItemAddDrawer,
  menuGroupCollapseSessionKey,
  collapsibleMenuSectionKeys: _collapsibleMenuSectionKeysFromParent,
  menuGroups,
  menuItems,
  cart,
  proteinTargetG,
  fatTargetG,
  onAddItem,
  onRemoveItem,
  onChangeGrams,
  onEditItem,
  onToggleFavorite,
  favoriteMenuItemIds,
  selectedRestaurant,
  confirmDeleteRestaurant,
  deletingRestaurant,
  onSetConfirmDeleteRestaurant,
  onOpenImportMenuItems,
  onDeleteRestaurant,
  onDownloadRestaurantJson,
  isSelectedRestaurantMenuLoading,
  selectedRestaurantMenuError,
  onRetryLoadSelectedRestaurantMenu,
  favoriteGroupsLoading,
  favoriteGroupsError,
  onRetryLoadFavoriteGroups,
  allMenusLoading,
  allMenusError,
  onEnsureAllMenusLoaded,
  onRetryLoadAllMenus,
}: MenuItemListProps) {
  void _collapsibleMenuSectionKeysFromParent;

  const isNormalRestaurantTab =
    Boolean(selectedRestaurantIdResolved) &&
    selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
    selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID;

  const [menuBrowseQuery, setMenuBrowseQuery] = useState("");
  const [crossSearchEnabled, setCrossSearchEnabled] = useState(
    () => readFavoritesCrossSearchEnabled()
  );

  const browseQueryTrimmed = menuBrowseQuery.trim();
  const isCrossActive =
    selectedRestaurantIdResolved === FAVORITES_TAB_ID &&
    crossSearchEnabled &&
    browseQueryTrimmed.length > 0;

  useEffect(() => {
    if (!isCrossActive) return;
    void onEnsureAllMenusLoaded();
  }, [isCrossActive, onEnsureAllMenusLoaded]);

  const crossSearchRestaurants = useMemo(
    () =>
      tabRestaurants.map((r) => ({
        id: r.id,
        name: r.name,
        display_order: r.display_order,
        order_count: r.order_count,
      })),
    [tabRestaurants]
  );

  const crossSearchMenuItems = useMemo(
    () => menuItems.filter((m) => crossSearchRestaurants.some((r) => r.id === m.restaurant_id)),
    [menuItems, crossSearchRestaurants]
  );

  const displayMenuGroups = useMemo(() => {
    if (isCrossActive) {
      return buildCrossRestaurantMenuGroups(
        crossSearchMenuItems,
        crossSearchRestaurants,
        menuBrowseQuery
      );
    }
    return filterMenuGroupsByBrowseQuery(menuGroups, menuBrowseQuery);
  }, [
    isCrossActive,
    crossSearchMenuItems,
    crossSearchRestaurants,
    menuBrowseQuery,
    menuGroups,
  ]);

  const collapsibleMenuSectionKeysForSession = useMemo(
    () => displayMenuGroups.filter((g) => g.groupName !== null).map((g) => g.sectionKey),
    [displayMenuGroups]
  );

  const hasAnyMenuRows = menuGroups.some((g) => g.items.length > 0);
  const effectiveCollapseSessionKey = isCrossActive
    ? `${CROSS_SEARCH_SCOPE}\0${collapsibleMenuSectionKeysForSession.join("\0")}`
    : menuGroupCollapseSessionKey;

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      {selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID ? (
        <StandardFoodPanel
          visibleRestaurants={tabRestaurants}
          compositionTargetRestaurantId={resolvedCompositionTargetId}
          canPickFood={Boolean(resolvedCompositionTargetId || snapshotRestaurantId)}
          onCompositionTargetChange={onCompositionTargetChange}
          onPickFood={onPickStandardFood}
        />
      ) : (
        <>
          {(selectedRestaurantIdResolved === FAVORITES_TAB_ID ||
            isNormalRestaurantTab) && (
            <div className="px-3 sm:px-4 pt-3 pb-1 shrink-0 space-y-2">
              <label className="sr-only" htmlFor="today-menu-browse-query">
                {selectedRestaurantIdResolved === FAVORITES_TAB_ID
                  ? crossSearchEnabled
                    ? "全店舗のメニューを検索"
                    : "お気に入りを検索"
                  : "メニューを検索"}
              </label>
              <input
                id="today-menu-browse-query"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={menuBrowseQuery}
                onChange={(e) => setMenuBrowseQuery(e.target.value)}
                placeholder={
                  selectedRestaurantIdResolved === FAVORITES_TAB_ID
                    ? crossSearchEnabled
                      ? "全店舗のメニューを検索"
                      : "お気に入りを検索"
                    : "メニューを検索"
                }
                className="w-full rounded-none border border-gray-700 bg-gray-950/80 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-emerald-600/70 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
              />
              {selectedRestaurantIdResolved === FAVORITES_TAB_ID ? (
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={crossSearchEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setCrossSearchEnabled(next);
                      writeFavoritesCrossSearchEnabled(next);
                    }}
                    className="rounded border-gray-600 bg-gray-900 text-emerald-600 focus:ring-emerald-600/40"
                  />
                  全店舗を横断して検索
                </label>
              ) : null}
            </div>
          )}
          {isCrossActive && allMenusError && (
            <div className="mx-4 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-200">{allMenusError}</p>
              <button
                type="button"
                onClick={() => void onRetryLoadAllMenus()}
                className="mt-2 rounded-md border border-amber-300/50 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
              >
                再試行
              </button>
            </div>
          )}
          {isNormalRestaurantTab && selectedRestaurantMenuError && (
            <div className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-200">{selectedRestaurantMenuError}</p>
              <button
                type="button"
                onClick={onRetryLoadSelectedRestaurantMenu}
                className="mt-2 rounded-md border border-amber-300/50 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
              >
                再試行
              </button>
            </div>
          )}
          {isNormalRestaurantTab && isSelectedRestaurantMenuLoading && displayMenuGroups.every((g) => g.items.length === 0) && (
            <p className="text-center text-gray-500 text-base sm:text-sm py-8">
              メニューを読み込み中...
            </p>
          )}
          {isCrossActive && allMenusLoading && displayMenuGroups.every((g) => g.items.length === 0) && (
            <p className="text-center text-gray-500 text-base sm:text-sm py-8">
              全店舗を検索中...
            </p>
          )}
          <MenuGroupCollapseSession
            key={effectiveCollapseSessionKey}
            selectedRestaurantIdResolved={selectedRestaurantIdResolved}
            storageScopeOverride={isCrossActive ? CROSS_SEARCH_SCOPE : undefined}
            collapsibleMenuSectionKeys={collapsibleMenuSectionKeysForSession}
          >
            {({ collapsedGroups, toggleMenuGroupCollapsed }) => (
              <>
                {displayMenuGroups.map((group) => {
                  if (group.groupName === null) {
                    return group.items.map((item) => (
                      <MenuItemRow
                        key={`${item.id}-${item.default_grams}`}
                        item={item}
                        entry={cart.get(item.id)}
                        onAdd={(g) => onAddItem(item, g)}
                        onRemove={() => onRemoveItem(item.id)}
                        onChangeGrams={(g) => onChangeGrams(item.id, g)}
                        onEdit={() => onEditItem(item)}
                        onToggleFavorite={() => void onToggleFavorite(item)}
                        isFavorited={favoriteMenuItemIds.has(item.id)}
                        pfcTargets={{
                          protein_target_g: proteinTargetG,
                          fat_target_g: fatTargetG,
                        }}
                      />
                    ));
                  }
                  const isCollapsed = collapsedGroups.has(group.sectionKey);
                  const cartCount = group.items.reduce(
                    (n, item) => n + (cart.get(item.id)?.count ?? 0),
                    0
                  );
                  return (
                    <div key={group.sectionKey}>
                      <button
                        onClick={() => toggleMenuGroupCollapsed(group.sectionKey)}
                        type="button"
                        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2 text-gray-400 text-xs sm:text-xs bg-gray-900/50 border-b border-gray-800/60 hover:text-gray-200 transition-colors min-h-9 sm:min-h-0"
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{isCollapsed ? "▶" : "▼"}</span>
                          <span>
                            {group.groupName}（{group.items.length}品）
                          </span>
                          {isCollapsed && cartCount > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-emerald-600 text-white rounded-full text-xs leading-none">
                              {cartCount}
                            </span>
                          )}
                        </span>
                      </button>
                      {!isCollapsed &&
                        group.items.map((item) => (
                          <MenuItemRow
                            key={`${item.id}-${item.default_grams}`}
                            item={item}
                            entry={cart.get(item.id)}
                            onAdd={(g) => onAddItem(item, g)}
                            onRemove={() => onRemoveItem(item.id)}
                            onChangeGrams={(g) => onChangeGrams(item.id, g)}
                            onEdit={() => onEditItem(item)}
                            onToggleFavorite={() => void onToggleFavorite(item)}
                            isFavorited={favoriteMenuItemIds.has(item.id)}
                            originCaption={group.originByItemId?.[item.id] ?? null}
                            pfcTargets={{
                              protein_target_g: proteinTargetG,
                              fat_target_g: fatTargetG,
                            }}
                          />
                        ))}
                    </div>
                  );
                })}
              </>
            )}
          </MenuGroupCollapseSession>

          {isNormalRestaurantTab && tabRestaurants.length > 0 && (
            <>
              <div className="px-4 pt-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenItemAddDrawer(selectedRestaurantIdResolved)
                  }
                  aria-label="メニューを追加"
                  className="w-full py-2.5 px-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors"
                >
                  ＋ メニューを追加
                </button>
              </div>

              {selectedRestaurant && (
                <div className="px-4 py-2.5 mt-2.5 pt-2.5 space-y-2 border-t border-gray-800/60">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onDownloadRestaurantJson}
                      className="flex-1 py-2 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg bg-gray-900/40"
                    >
                      JSONでエクスポート
                    </button>
                    <button
                      type="button"
                      onClick={onOpenImportMenuItems}
                      className="flex-1 py-2 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg bg-gray-900/40"
                    >
                      JSONでメニューを追加
                    </button>
                  </div>

                  {confirmDeleteRestaurant ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onSetConfirmDeleteRestaurant(false)}
                        className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={onDeleteRestaurant}
                        disabled={deletingRestaurant}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                      >
                        {deletingRestaurant ? "削除中..." : "削除する"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSetConfirmDeleteRestaurant(true)}
                      className="w-full py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      このお店を削除
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {browseQueryTrimmed &&
            displayMenuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved === FAVORITES_TAB_ID &&
            !favoriteGroupsLoading &&
            !favoriteGroupsError &&
            !allMenusLoading &&
            !allMenusError && (
              <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
                検索に一致するメニューがありません
              </p>
            )}
          {!browseQueryTrimmed &&
            !isCrossActive &&
            menuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved === FAVORITES_TAB_ID && (
              <FavoritesPanel
                loading={favoriteGroupsLoading}
                error={favoriteGroupsError}
                onRetry={onRetryLoadFavoriteGroups}
              />
            )}
          {browseQueryTrimmed &&
            isNormalRestaurantTab &&
            hasAnyMenuRows &&
            displayMenuGroups.every((g) => g.items.length === 0) &&
            !isSelectedRestaurantMenuLoading &&
            !selectedRestaurantMenuError && (
              <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
                検索に一致するメニューがありません
              </p>
            )}
          {!browseQueryTrimmed &&
            menuGroups.every((g) => g.items.length === 0) &&
            isNormalRestaurantTab &&
            tabRestaurants.length > 0 &&
            !isSelectedRestaurantMenuLoading &&
            !selectedRestaurantMenuError && (
              <p className="text-center text-gray-500 text-base sm:text-sm py-8">
                この店舗にメニューがありません
              </p>
            )}
        </>
      )}
    </div>
  );
}
