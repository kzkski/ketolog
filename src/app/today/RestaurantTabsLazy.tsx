"use client";

import { useEffect, useState, type ComponentType } from "react";
import { RestaurantTabsStatic } from "./RestaurantTabsStatic";
import type { SortableRestaurantTabsProps } from "./SortableRestaurantTabs";

export type RestaurantTabsLazyProps = SortableRestaurantTabsProps;

export function RestaurantTabsLazy(props: RestaurantTabsLazyProps) {
  const [Sortable, setSortable] = useState<ComponentType<SortableRestaurantTabsProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./SortableRestaurantTabs").then((m) => {
      if (!cancelled) setSortable(() => m.SortableRestaurantTabs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Sortable) {
    return (
      <RestaurantTabsStatic
        tabRestaurants={props.tabRestaurants}
        selectedRestaurantIdResolved={props.selectedRestaurantIdResolved}
        onSelectRestaurant={props.onSelectRestaurant}
        onOpenTabMenu={props.onOpenTabMenu}
      />
    );
  }

  return <Sortable {...props} />;
}
