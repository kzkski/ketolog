"use client";

import type { MenuItem, Restaurant } from "@/types/database";
import type { StandardFoodSearchRow } from "../actions/menu-item";
import { StandardFoodPanel } from "../StandardFoodPanel";
import { MenuGroupCollapseSession } from "../MenuGroupCollapseSession";
import type { MenuGroup } from "../_hooks/useRestaurantState";
import { FAVORITES_TAB_ID, MEXT_COMPOSITION_TAB_ID } from "../_hooks/useRestaurantState";
import type { CartEntry } from "./CartPanel";
import { MenuItemRow } from "./MenuItemRow";

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
  collapsibleMenuSectionKeys,
  menuGroups,
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
}: MenuItemListProps) {
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
          <MenuGroupCollapseSession
            key={menuGroupCollapseSessionKey}
            selectedRestaurantIdResolved={selectedRestaurantIdResolved}
            collapsibleMenuSectionKeys={collapsibleMenuSectionKeys}
          >
            {({ collapsedGroups, toggleMenuGroupCollapsed }) => (
              <>
                {menuGroups.map((group) => {
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

          {selectedRestaurantIdResolved &&
            selectedRestaurantIdResolved !== FAVORITES_TAB_ID && (
              <div className="px-4 py-3 space-y-2 border-t border-gray-800/60 mt-1">
                <button
                  onClick={() =>
                    onOpenItemAddDrawer(selectedRestaurantIdResolved)
                  }
                  className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
                >
                  ＋ メニューを追加
                </button>

                {selectedRestaurant && (
                  <div className="flex gap-2">
                    <button
                      onClick={onDownloadRestaurantJson}
                      className="flex-1 py-1.5 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg"
                    >
                      JSONでエクスポート
                    </button>
                    <button
                      onClick={onOpenImportMenuItems}
                      className="flex-1 py-1.5 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg"
                    >
                      JSONでメニューを追加
                    </button>
                  </div>
                )}

                {selectedRestaurant &&
                  (confirmDeleteRestaurant ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSetConfirmDeleteRestaurant(false)}
                        className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={onDeleteRestaurant}
                        disabled={deletingRestaurant}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                      >
                        {deletingRestaurant ? "削除中..." : "削除する"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetConfirmDeleteRestaurant(true)}
                      className="w-full py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      このお店を削除
                    </button>
                  ))}
              </div>
            )}

          {menuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved === FAVORITES_TAB_ID && (
              <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
                お気に入りはまだありません。各メニューの☆をタップすると、ここに集約されます。
              </p>
            )}
          {menuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved &&
            selectedRestaurantIdResolved !== FAVORITES_TAB_ID && (
              <p className="text-center text-gray-500 text-base sm:text-sm py-8">
                メニューがまだありません
              </p>
            )}
        </>
      )}
    </div>
  );
}
