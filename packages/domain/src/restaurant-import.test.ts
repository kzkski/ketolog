import { describe, expect, it } from "vitest";
import { dedupeImportItemsBySharedBarcode } from "./restaurant-import";

describe("dedupeImportItemsBySharedBarcode", () => {
  it("バッチ内の2件目以降の重複バーコードを外す", () => {
    const out = dedupeImportItemsBySharedBarcode([
      { name: "a", shared_barcode: "4900000000001" },
      { name: "b", shared_barcode: "4900000000001" },
      { name: "c", shared_barcode: "4900000000002" },
    ]);
    expect(out.map((i) => i.shared_barcode)).toEqual(["4900000000001", null, "4900000000002"]);
    expect(out.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("取込先に既にあるバーコードを外す", () => {
    const out = dedupeImportItemsBySharedBarcode(
      [{ shared_barcode: "4900000000001" }, { shared_barcode: "4900000000003" }],
      ["4900000000001"]
    );
    expect(out.map((i) => i.shared_barcode)).toEqual([null, "4900000000003"]);
  });

  it("null / 未指定 / 空文字は対象外のまま残す", () => {
    const items = [{ shared_barcode: null }, {}, { shared_barcode: "" }];
    expect(dedupeImportItemsBySharedBarcode(items)).toEqual(items);
  });
});
