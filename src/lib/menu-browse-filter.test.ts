import { describe, expect, it } from "vitest";
import { filterMenuGroupsByBrowseQuery } from "./menu-browse-filter";

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
