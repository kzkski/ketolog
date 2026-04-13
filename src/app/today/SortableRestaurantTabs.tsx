"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Restaurant } from "@/types/database";
import { RestaurantTabNameButton } from "./RestaurantTabsStatic";

function SortableRestaurantTab({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: restaurant.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex shrink-0 items-stretch border-b-2 min-h-9 sm:min-h-0 ${
        selected ? "border-emerald-500" : "border-transparent"
      }`}
    >
      <button
        type="button"
        className="pl-2 pr-1 sm:pl-1.5 sm:pr-0.5 flex items-center text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-manipulation"
        aria-label={`${restaurant.name}の表示順を変更`}
        suppressHydrationWarning
        {...attributes}
        {...listeners}
      >
        ⣿
      </button>
      <RestaurantTabNameButton
        restaurant={restaurant}
        selected={selected}
        onSelect={onSelect}
        onOpenTabMenu={onOpenTabMenu}
      />
    </div>
  );
}

export type SortableRestaurantTabsProps = {
  tabRestaurants: Restaurant[];
  tabRestaurantIds: string[];
  selectedRestaurantIdResolved: string;
  onSelectRestaurant: (id: string) => void;
  onOpenTabMenu: (r: Restaurant, clientX: number, clientY: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function SortableRestaurantTabs({
  tabRestaurants,
  tabRestaurantIds,
  selectedRestaurantIdResolved,
  onSelectRestaurant,
  onOpenTabMenu,
  onDragEnd,
}: SortableRestaurantTabsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tabRestaurantIds} strategy={horizontalListSortingStrategy}>
        {tabRestaurants.map((r) => (
          <SortableRestaurantTab
            key={r.id}
            restaurant={r}
            selected={selectedRestaurantIdResolved === r.id}
            onSelect={() => onSelectRestaurant(r.id)}
            onOpenTabMenu={onOpenTabMenu}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
