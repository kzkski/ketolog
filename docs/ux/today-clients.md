# Today 画面: Web とモバイルのクライアント対応表

食事の選び方・カート・メニュー登録まわりの **Web (`TodayClient` 系)** と **モバイル (`TodayScreen` + `TodayMenuPanel`)** の対応を整理する。詳細な同期戦略は `docs/architecture/food-log-sync.md` を参照。

| 観点 | Web | Mobile（Expo） | メモ / Issue |
|------|-----|----------------|--------------|
| 食事区分の選び方 | 画面上部の朝食・昼食・夕食・間食タブ | 同様のタブ | 記録時の `meal_type` が一致 |
| メニュー候補の出し方 | 店舗タブ / お気に入り / 文科省成分表（仮想タブ） | `TodayMenuPanel` のお気に入り・店舗タブ・成分表タブ | 店舗の並び・`display_order` 保存の扱いは各クライアント実装に寄せている |
| **メニュー名での絞り込み** | お気に入り・店舗メニュー一覧の検索欄（名前の部分一致） | 同様（`TodayMenuPanel` の `query`） | Web 側は [#302](https://github.com/kzkski/ketolog/issues/302) でモバイルと同等の検索を追加 |
| **お気に入り横断検索** | お気に入りタブの検索欄に「全店舗を横断して検索」トグル。ON + クエリ時は全店舗メニューを店舗名グループで表示 | 同様（`TodayMenuPanel` / `MenuBrowseSearchField`） | [#339](https://github.com/kzkski/ketolog/issues/339)。店舗タブの検索は従来どおりその店のみ |
| カートへの追加 | メニュー行の「＋」、量（g）の編集 | 同様 | カートはクライアント内 state |
| **カート行の列** | 名前 / PFC / 回数 / g（½ 付き） / 削除 | 同様 | 名前横の `×n（合計g）` は出さない（[#345](https://github.com/kzkski/ketolog/issues/345)） |
| **分量の半分ショートカット** | g 入力の横に `½`（記録済み編集にも同じ） | カート行・grams シート・記録モーダルに同じ `½` | g を ÷2。回数の 0.5 とは別操作 |
| カートの保存・記録 | 楽観 UI + サーバー保存（`saveMealToLog`） | オンラインは DB 反映待ち、オフラインは outbox | [#304](https://github.com/kzkski/ketolog/issues/304) |
| グループ見出しの折りたたみ | `MenuGroupCollapseSession`（localStorage） | AsyncStorage 相当（ネイティブ用ストレージ） | スコープはお気に入り / 店舗 ID 単位 |
| 折りたたみ時のカート件数バッジ | グループヘッダに合計件数（折りたたみ中のみ） | （任意）同様の UI を入れる場合はカート情報の受け渡しが必要 | Web は `MenuItemList` 実装 |
| 店舗の追加 | `RestaurantPanel` の「＋」→ シート | `TodayMenuPanel` の「＋」→ モーダル | フローは近いが UI コンポーネントは別 |
| メニュー行の追加 | 一覧下「＋ メニューを追加」→ ドロワー | 同文言の行 → モーダル | 登録先店は「現在の店舗タブ」をヒントにできる |
| JSON インポート / エクスポート | `MenuItemList` 下部のボタン | 同様 | `@ketolog/domain/restaurant-json-v1` を共有 |
| お気に入り（☆） | メニュー行からトグル | 同様 | サーバーアクション / Supabase の経路は各プラットフォーム |

## 関連ファイル（目安）

- Web: `src/app/today/TodayClient.tsx`, `src/app/today/_components/MenuItemList.tsx`, `src/app/today/_components/RestaurantPanel.tsx`, `src/app/today/_hooks/useRestaurantState.ts`
- Mobile: `apps/mobile/screens/TodayScreen.tsx`, `apps/mobile/components/TodayMenuPanel.tsx`
