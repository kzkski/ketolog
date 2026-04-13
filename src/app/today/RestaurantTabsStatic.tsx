"use client";

import { useCallback, useRef } from "react";
import type { Restaurant } from "@/types/database";

/** お店タブのラベル部分（右クリック／長押しメニュー・選択）。並べ替え UI と共有。 */
export function RestaurantTabNameButton({
  restaurant,
  selected,
  onSelect,
  onOpenTabMenu,
}: {
  restaurant: Restaurant;
  selected: boolean;
  onSelect: () => void;
  onOpenTabMenu: (r: Restaurant, clientX: number, clientY: number) => void;
}) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenTabMenu(restaurant, e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        touchAnchorRef.current = { x: t.clientX, y: t.clientY };
        clearLongPress();
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const a = touchAnchorRef.current;
          touchAnchorRef.current = null;
          if (a) onOpenTabMenu(restaurant, a.x, a.y);
        }, 550);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        const a = touchAnchorRef.current;
        if (!t || !a) return;
        if (Math.abs(t.clientX - a.x) > 12 || Math.abs(t.clientY - a.y) > 12) {
          clearLongPress();
          touchAnchorRef.current = null;
        }
      }}
      onTouchEnd={() => {
        clearLongPress();
        touchAnchorRef.current = null;
      }}
      onTouchCancel={() => {
        clearLongPress();
        touchAnchorRef.current = null;
      }}
      title="長押しまたは右クリックでメニュー"
      className={`pl-1 pr-3 sm:pl-0.5 sm:pr-2.5 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap text-left transition-colors touch-manipulation min-w-0 max-w-[12rem] sm:max-w-none truncate ${
        selected ? "text-white" : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {restaurant.name}
    </button>
  );
}

/** dnd-kit 未ロード時: ドラッグハンドルなしの通常タブ列 */
export function RestaurantTabsStatic({
  tabRestaurants,
  selectedRestaurantIdResolved,
  onSelectRestaurant,
  onOpenTabMenu,
}: {
  tabRestaurants: Restaurant[];
  selectedRestaurantIdResolved: string;
  onSelectRestaurant: (id: string) => void;
  onOpenTabMenu: (r: Restaurant, clientX: number, clientY: number) => void;
}) {
  return (
    <>
      {tabRestaurants.map((r) => (
        <div
          key={r.id}
          className={`flex shrink-0 items-stretch border-b-2 min-h-9 sm:min-h-0 ${
            selectedRestaurantIdResolved === r.id ? "border-emerald-500" : "border-transparent"
          }`}
        >
          <RestaurantTabNameButton
            restaurant={r}
            selected={selectedRestaurantIdResolved === r.id}
            onSelect={() => onSelectRestaurant(r.id)}
            onOpenTabMenu={onOpenTabMenu}
          />
        </div>
      ))}
    </>
  );
}
