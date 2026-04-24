import type { MenuShareImportItem } from "./menu-share-qr";

/** Web `importRestaurantData` / Mobile `importRestaurantDataMobile` 共通（`import-export.ts` と同一） */
export type ImportRestaurantEntry = {
  name: string;
  category: string;
  menuItems: MenuShareImportItem[];
};

export type ImportData = {
  version: number;
  restaurants: ImportRestaurantEntry[];
};
