/**
 * Today のお気に入り・店舗メニュー一覧向け: 名前の部分一致（大文字小文字無視）でグループ内アイテムを絞り込む。
 * モバイル `TodayMenuPanel` の `query` / `buildFavoriteMenuGroups` と同じ方針。
 */
export function filterMenuGroupsByBrowseQuery<
  T extends { id: string; name: string },
  G extends {
    sectionKey: string;
    groupName: string | null;
    groupOrder: number;
    items: T[];
    originByItemId?: Record<string, string>;
  },
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
