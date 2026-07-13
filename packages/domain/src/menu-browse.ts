/**
 * Today のお気に入り・店舗メニュー一覧向けフィルタと、お気に入り横断検索用グループ構築。
 */

export type MenuBrowseGroup<T extends { id: string; name: string }> = {
  sectionKey: string;
  groupName: string | null;
  groupOrder: number;
  items: T[];
  /** 行ごとの補足（お気に入り由来 / 店内グループ名など） */
  originByItemId?: Record<string, string>;
};

export const CROSS_SEARCH_SECTION_KEY_PREFIX = "xref:";

export function filterMenuGroupsByBrowseQuery<
  T extends { id: string; name: string },
  G extends MenuBrowseGroup<T>,
>(groups: G[], rawQuery: string): G[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((g) => {
      const items = g.items.filter((item) => item.name.toLowerCase().includes(q)) as T[];
      let originByItemId = g.originByItemId;
      if (g.originByItemId) {
        originByItemId = {};
        for (const item of items) {
          const o = g.originByItemId[item.id];
          if (o !== undefined) originByItemId[item.id] = o;
        }
      }
      return { ...g, items, originByItemId } as G;
    })
    .filter((g) => g.items.length > 0);
}

export type CrossSearchMenuItem = {
  id: string;
  name: string;
  restaurant_id: string;
  group_name?: string | null;
  rank: number;
  created_at?: string | null;
};

export type CrossSearchRestaurant = {
  id: string;
  name: string;
  display_order?: number | null;
  order_count: number;
};

/** Web `compareMenuItemsForListOrder` と同順（`src/lib/menu-item-sort.ts`） */
function compareMenuItemsForBrowseOrder(
  a: CrossSearchMenuItem,
  b: CrossSearchMenuItem
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const nameCmp = a.name.localeCompare(b.name, "ja");
  if (nameCmp !== 0) return nameCmp;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * お気に入りタブ横断検索: クエリに一致するメニューを店舗名でグルーピングする。
 * `restaurants` の並び順でグループを並べる（スナップショット店などリスト外 ID は除外）。
 */
export function buildCrossRestaurantMenuGroups<T extends CrossSearchMenuItem>(
  items: T[],
  restaurants: CrossSearchRestaurant[],
  rawQuery: string
): MenuBrowseGroup<T>[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q || restaurants.length === 0) return [];

  const allowedRestaurantIds = new Set(restaurants.map((r) => r.id));
  const byRestaurant = new Map<string, T[]>();

  for (const item of items) {
    if (!allowedRestaurantIds.has(item.restaurant_id)) continue;
    if (!item.name.toLowerCase().includes(q)) continue;
    const list = byRestaurant.get(item.restaurant_id) ?? [];
    list.push(item);
    byRestaurant.set(item.restaurant_id, list);
  }

  const groups: MenuBrowseGroup<T>[] = [];
  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i]!;
    const restaurantItems = byRestaurant.get(restaurant.id);
    if (!restaurantItems?.length) continue;

    const sorted = [...restaurantItems].sort(compareMenuItemsForBrowseOrder);
    const originByItemId: Record<string, string> = {};
    for (const item of sorted) {
      const groupName = item.group_name?.trim();
      if (groupName) originByItemId[item.id] = groupName;
    }

    groups.push({
      sectionKey: `${CROSS_SEARCH_SECTION_KEY_PREFIX}${restaurant.id}`,
      groupName: restaurant.name,
      groupOrder: i,
      items: sorted,
      originByItemId:
        Object.keys(originByItemId).length > 0 ? originByItemId : undefined,
    });
  }

  return groups;
}
