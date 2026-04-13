import type { MenuItem } from "@/types/database";

/**
 * Today のメニュー一覧用の全順序付け。`src/app/today/page.tsx` の `menu_items` 取得
 * `.order(...)` と同じ意味に揃える（`order_count` は使わない）。
 *
 * @see https://github.com/kzkski/ketolog/issues/188
 */
export function compareMenuItemsForListOrder(a: MenuItem, b: MenuItem): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const nameCmp = a.name.localeCompare(b.name, "ja");
  if (nameCmp !== 0) return nameCmp;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMenuItemsForListOrder<T extends MenuItem>(items: T[]): T[] {
  return [...items].sort(compareMenuItemsForListOrder);
}
