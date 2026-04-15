"use client";

import type { Restaurant } from "@/types/database";
import type { DragEndEvent } from "@dnd-kit/core";
import { STANDARD_FOOD_TAB_TITLE } from "@/lib/standard-food-groups";
import { RestaurantTabsLazy } from "../RestaurantTabsLazy";

function RestaurantTabSearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export type RestaurantPanelProps = {
  favoritesTabId: string;
  compositionTabId: string;
  selectedRestaurantIdResolved: string;
  onSelectFavorites: () => void;
  onSelectCompositionTab: () => void;
  tabRestaurants: Restaurant[];
  tabRestaurantIds: string[];
  onSelectRestaurantTab: (id: string) => void;
  onOpenRestaurantTabMenu: (r: Restaurant, cx: number, cy: number) => void;
  onRestaurantDragEnd: (e: DragEndEvent) => void;
  onOpenRestaurantAddSheet: () => void;
};

export function RestaurantPanel({
  favoritesTabId,
  compositionTabId,
  selectedRestaurantIdResolved,
  onSelectFavorites,
  onSelectCompositionTab,
  tabRestaurants,
  tabRestaurantIds,
  onSelectRestaurantTab,
  onOpenRestaurantTabMenu,
  onRestaurantDragEnd,
  onOpenRestaurantAddSheet,
}: RestaurantPanelProps) {
  return (
    <div className="flex-none flex border-b border-gray-800 overflow-x-auto [scrollbar-gutter:stable] pl-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))] items-stretch">
      <button
        type="button"
        onClick={onSelectFavorites}
        className={`inline-flex items-center justify-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 border-b-2 transition-colors min-h-9 sm:min-h-0 touch-manipulation ${
          selectedRestaurantIdResolved === favoritesTabId
            ? "border-amber-500 text-amber-100"
            : "border-transparent text-gray-500 hover:text-gray-300"
        }`}
      >
        <span className="text-[0.95em] leading-none tabular-nums" aria-hidden>
          {selectedRestaurantIdResolved === favoritesTabId ? "★" : "☆"}
        </span>
        お気に入り
      </button>
      <button
        type="button"
        title={STANDARD_FOOD_TAB_TITLE}
        onClick={onSelectCompositionTab}
        className={`inline-flex min-w-0 max-w-[11rem] sm:max-w-none items-center justify-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2.5 text-[11px] sm:text-sm font-bold whitespace-nowrap shrink-0 border-b-2 transition-colors min-h-9 sm:min-h-0 touch-manipulation ${
          selectedRestaurantIdResolved === compositionTabId
            ? "border-sky-500 text-sky-100"
            : "border-transparent text-gray-500 hover:text-gray-300"
        }`}
      >
        <RestaurantTabSearchIcon className="size-[1.1em] shrink-0 sm:size-[1.05em]" />
        <span className="sm:hidden">成分表</span>
        <span className="hidden min-w-0 truncate sm:inline">食品成分表2023</span>
      </button>
      <RestaurantTabsLazy
        tabRestaurants={tabRestaurants}
        tabRestaurantIds={tabRestaurantIds}
        selectedRestaurantIdResolved={selectedRestaurantIdResolved}
        onSelectRestaurant={onSelectRestaurantTab}
        onOpenTabMenu={onOpenRestaurantTabMenu}
        onDragEnd={onRestaurantDragEnd}
      />
      <button
        type="button"
        onClick={onOpenRestaurantAddSheet}
        className="px-2.5 py-1.5 sm:py-2.5 min-w-9 sm:min-w-11 text-gray-500 hover:text-white shrink-0 transition-colors text-lg sm:text-lg leading-none flex items-center justify-center self-center"
      >
        ＋
      </button>
    </div>
  );
}
