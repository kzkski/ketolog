import { describe, expect, it } from "vitest";
import {
  buildCrossRestaurantMenuGroups,
  filterMenuGroupsByBrowseQuery,
} from "./menu-browse";

describe("filterMenuGroupsByBrowseQuery", () => {
  const groups = [
    {
      sectionKey: "favg:a",
      groupName: "店A",
      groupOrder: 0,
      items: [
        { id: "1", name: "サーモン" },
        { id: "2", name: "ブロッコリー" },
      ],
      originByItemId: { "1": "店A", "2": "店A · 副菜" },
    },
    {
      sectionKey: "favg:b",
      groupName: "店B",
      groupOrder: 1,
      items: [{ id: "3", name: "卵" }],
    },
  ];

  it("空クエリでは入力と同一の参照で返す", () => {
    const out = filterMenuGroupsByBrowseQuery(groups, "  ");
    expect(out).toBe(groups);
  });

  it("名前の部分一致で絞り込み、空グループは落とす", () => {
    const out = filterMenuGroupsByBrowseQuery(groups, "ロッ");
    expect(out).toHaveLength(1);
    expect(out[0]!.items.map((i) => i.id)).toEqual(["2"]);
  });

  it("originByItemId を残す項目に合わせて絞る", () => {
    const out = filterMenuGroupsByBrowseQuery(groups, "サーモン");
    expect(out).toHaveLength(1);
    expect(out[0]!.originByItemId).toEqual({ "1": "店A" });
  });
});

describe("buildCrossRestaurantMenuGroups", () => {
  const restaurants = [
    { id: "r1", name: "店A", display_order: 0, order_count: 10 },
    { id: "r2", name: "店B", display_order: 1, order_count: 5 },
  ];

  const items = [
    {
      id: "m1",
      name: "サーモン",
      restaurant_id: "r1",
      group_name: "魚",
      rank: 1,
      created_at: "2026-01-01",
    },
    {
      id: "m2",
      name: "ブロッコリー",
      restaurant_id: "r1",
      group_name: null,
      rank: 2,
      created_at: "2026-01-02",
    },
    {
      id: "m3",
      name: "サーモン丼",
      restaurant_id: "r2",
      group_name: "丼",
      rank: 1,
      created_at: "2026-01-03",
    },
    {
      id: "snap",
      name: "スナップショット魚",
      restaurant_id: "snapshot-id",
      group_name: null,
      rank: 1,
      created_at: null,
    },
  ];

  it("空クエリでは空配列", () => {
    expect(buildCrossRestaurantMenuGroups(items, restaurants, "  ")).toEqual([]);
  });

  it("店舗名でグルーピングし restaurants 順を維持する", () => {
    const out = buildCrossRestaurantMenuGroups(items, restaurants, "サーモン");
    expect(out).toHaveLength(2);
    expect(out[0]!.sectionKey).toBe("xref:r1");
    expect(out[0]!.groupName).toBe("店A");
    expect(out[0]!.items.map((i) => i.id)).toEqual(["m1"]);
    expect(out[1]!.groupName).toBe("店B");
    expect(out[1]!.items.map((i) => i.id)).toEqual(["m3"]);
  });

  it("店内 group_name を originByItemId に載せる", () => {
    const out = buildCrossRestaurantMenuGroups(items, restaurants, "サーモン");
    expect(out[0]!.originByItemId).toEqual({ m1: "魚" });
    expect(out[1]!.originByItemId).toEqual({ m3: "丼" });
  });

  it("restaurants リストに無い店舗 ID のメニューは除外する", () => {
    const out = buildCrossRestaurantMenuGroups(items, restaurants, "スナップショット");
    expect(out).toEqual([]);
  });
});
