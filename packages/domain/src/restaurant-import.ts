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

/**
 * 一括取込前に `shared_barcode` の重複を外す（Issue #358）。
 * 同一店舗に同じバーコードのメニューは DB のユニークインデックスで拒否されるため、
 * バッチ内の2件目以降と、取込先に既にあるバーコードは `shared_barcode` を null にしてメニュー自体は取り込む。
 */
export function dedupeImportItemsBySharedBarcode<T extends { shared_barcode?: string | null }>(
  items: T[],
  existingBarcodes: Iterable<string> = []
): T[] {
  const seen = new Set(existingBarcodes);
  return items.map((item) => {
    const barcode = item.shared_barcode?.trim();
    if (!barcode) return item;
    if (seen.has(barcode)) return { ...item, shared_barcode: null };
    seen.add(barcode);
    return item;
  });
}
