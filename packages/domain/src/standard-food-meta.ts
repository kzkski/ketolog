/** 文科省表検索の1ページ表示件数（`search_standard_foods` の p_limit は最大100） */
export const STANDARD_FOOD_SEARCH_PAGE_SIZE = 40;

/** 日本食品標準成分表（八訂増補）の食品群コードと表示名（Excel 第2章の分類に準拠） */
export const STANDARD_FOOD_GROUP_OPTIONS: { code: string; label: string }[] = [
  { code: "01", label: "穀類" },
  { code: "02", label: "いも及びでん粉類" },
  { code: "03", label: "砂糖及び甘味類" },
  { code: "04", label: "豆類" },
  { code: "05", label: "種実類" },
  { code: "06", label: "野菜類" },
  { code: "07", label: "果実類" },
  { code: "08", label: "きのこ類" },
  { code: "09", label: "藻類" },
  { code: "10", label: "魚介類" },
  { code: "11", label: "肉類" },
  { code: "12", label: "卵類" },
  { code: "13", label: "乳類" },
  { code: "14", label: "油脂類" },
  { code: "15", label: "菓子類" },
  { code: "16", label: "し好飲料類" },
  { code: "17", label: "調味料及び香辛料類" },
  { code: "18", label: "調理済み流通食品類" },
];

export const STANDARD_FOOD_TAB_TITLE =
  "文科省食品成分表2023増補版（日本食品標準成分表・八訂増補2023）";
