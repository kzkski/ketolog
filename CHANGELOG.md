# Changelog

このプロジェクトの変更履歴です。

基本方針:
- `feat` / `fix` / `refactor` / `docs` の Pull Request では、原則 `CHANGELOG.md` を更新します（CIでチェック）。
- 詳細な背景や設計意図など長文は [ROADMAP.md](ROADMAP.md) に寄せ、ここにはユーザー視点の要点を短く残します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) を参考にしています。

## [Unreleased]

### Fixed

- **今日ページヘッダー**: ヒントが PFC バー（確定摂取＋カート）と同期するよう改善。スロット内の `localStorage` 固定をやめ、文面は約 300ms デバウンスで更新（[#79](https://github.com/kzkski/ketolog/issues/79)）。

### Changed

- **開発者向け**: アプリ未使用の `body_composition` / `daily_log` / `daily_summary` をベースラインから削除（[#74](https://github.com/kzkski/ketolog/issues/74)）。ベースラインの内容を変更したため、ローカルでチェックサム不一致になる場合は `supabase db reset` するか、[migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) を参照。

## [1.15.0] - 2026-04-12

### Added

- **プリセット**: ケンタッキーフライドチキン（オリジナルチキン部位：キール・サイ・ドラム・ウイング・リブ）を `public/presets/kfc-original-chicken.json` として同梱（[#76](https://github.com/kzkski/ketolog/issues/76)）。

## [1.14.0] - 2026-04-11

### Added

- **開発者向け**: Supabase CLI（`devDependency`）と `supabase/config.toml` を追加。`supabase db push` で `public` スキーマを再現可能に。ベースラインは `supabase/migrations/20260211120000_baseline.sql`（旧差分は `supabase/migrations_archive/issue72_before_baseline/` に退避）。README にセットアップ手順と `npm run db:dump-baseline`（リンク済みプロジェクトからのスキーマダンプ）を記載（[#72](https://github.com/kzkski/ketolog/issues/72)）。

## [1.13.0] - 2026-04-11

### Added

- **今日ページヘッダー**: 「今日」表示中かつ Asia/Tokyo の時間帯（昼前・夕前・就寝前）に、日次 PFC の状況に応じた一言ヒントを表示。スロット内は文面を固定（`localStorage`）。目標値を変えると再計算（[#70](https://github.com/kzkski/ketolog/issues/70)）。

## [1.12.0] - 2026-04-11

### Added

- **メニュー一覧**: 1回分あたりのタンパク質・脂質が、日次目標の一定割合以上、または 100g あたりの濃度が高いとき、P / F の数値を上部バーと同系色（青・黄）で表示。糖質（C）は色付けしない。

## [1.11.0] - 2026-04-11

### Added

- **お気に入り（DB 再設計）**: `favorite_groups` / `favorite_entries` で `menu_items` を参照。お気に入りタブは **グループ単位**（初期は店名）で表示し、各行に **店名・店内グループ** 由来を表示（[#66](https://github.com/kzkski/ketolog/issues/66)）。マイグレーション `20260412120000_favorite_groups_entries.sql`（既存 `is_favorite` を移行のうえ列廃止）。

### Changed

- **JSON エクスポート**: 単店・全店エクスポートから `is_favorite` を削除（お気に入りは DB の `favorite_entries` で管理）。
- **JSON インポート**: メニューに `is_favorite: true` があれば、取り込み後に `favorite_entries` へ反映（店名グループへ配置）。

## [1.10.0] - 2026-04-11

### Added

- **お気に入り**: メニュー行の星でトグル。先頭の「お気に入り」タブからカート・記録できる（[#6](https://github.com/kzkski/ketolog/issues/6)）。

### Changed

- **自炊・プリセット**: 「マイフード」の特別扱い（タブ先頭固定・削除・並べ替え不可）を廃止。同梱プリセットを `homemade-keto.json`（店名 **汎用食材**）に統一し、他店と同様に並べ替え・削除できる。新規シードも `display_order` に従う（[#6](https://github.com/kzkski/ketolog/issues/6)）。
- **`homemade-keto.json`**: Issue #6 コメント添付の JSON をそのまま反映（55 品・`_schema` 付きエクスポート形式）。
- ローカルでのモバイル幅確認手順を README に追記した（[#64](https://github.com/kzkski/ketolog/issues/64)）。

## [1.9.1] - 2026-04-11

### Fixed

- **メニュー追加ドロワー**: `sm`（640px）未満では開いた直ちに「名前」へ自動フォーカスしないようにし、ソフトウェアキーボードが勝手に開くのを避けた（[#62](https://github.com/kzkski/ketolog/issues/62)）。`sm` 以上では従来どおり名前欄へフォーカスする。

### Changed

- **メニュー追加ドロワー**: 見出しまわりを圧縮し、登録操作を固定フッターではなくフォーム末尾までスクロールして行うようにした。

## [1.9.0] - 2026-04-11

### Added

- **スナップショット食事ログ**: メニュー一覧に載せず `food_log` に保存（`menu_item_id` は null）。`source` にはユーザーごとの内部用レストラン「（スナップショット記録）」を使用（[#52](https://github.com/kzkski/ketolog/issues/52)）。
- **記録ドロワー（新規追加時）**: 同じ入力から「このお店のメニューに登録」「カートに入れる（一覧に載せない）」「今すぐ食事ログに記録」を選べる。Open Food Facts のバーコード連携は従来どおり。
- **食事タブ行の右端に「＋」を1つ**: いま選んでいる食事区分で上記ドロワーを開く（区分ごとの「＋」は設けない）。
- **カート**: メニュー品とスナップショット行の混在、行ごとにカートから外せる。パネル色を選択中の食事区分と同系色に連動し、展開時に記録先の食事を切り替え可能（上部の食事タブの区分とも同期）。
- Open Food Facts API の利用申告（usage form）・User-Agent・環境変数・レート制限の要点を README に追記し、`.env.example` に `OFF_*` のコメント例を追加した。

### Changed

- **今日ページ（スマホ）**: カートは折りたたみ時は細いバーのみとし、展開時はボトムシートのオーバーレイに表示してメニュー一覧の縦スペースを確保した（[#60](https://github.com/kzkski/ketolog/issues/60)）。
- **メニュー追加ドロワー**: 見出しを「{店名}へメニューを追加」形式に集約し、登録先の説明ブロックをなくした。バーコード映像は最大高さ付きでスクロール内に表示。新規追加時の登録系3ボタンはスマホで2列＋短いラベルとした。
- 今日ページの**初期食事区分**を **Asia/Tokyo** の現在時刻に揃えた（「今日」の日付表示と整合。タブ表示の食い違い対策を含む）。
- メニュー追加ドロワーの見出し・登録ボタンで登録先の店名を示す（長い補足文は見出しに集約し省略）。
- 食事タブ行の「＋」をエメラルド系で強調。「この日の記録」トグルを右寄せにした。

## [1.7.2] - 2026-04-10

### Fixed

- `shared_products` に RLS がありポリシーが無いとキャッシュ行が作れず、`menu_items.shared_barcode` の外部キーで保存に失敗する問題に対し、認証ユーザー向けの SELECT / INSERT / UPDATE ポリシーをマイグレーションで追加した。
- OFF 取得後の `shared_products` upsert が失敗しても成功扱いにならないよう、エラーを返すようにした。

## [1.7.1] - 2026-04-10

### Fixed

- iPhone の Safari / Chrome でバーコード読み取りのカメラプレビューが真っ暗になる不具合を修正した。`getUserMedia` と `BarcodeDetector` の可否を分離し、後者が無い環境では ZXing でビデオフレームからデコードするようにした。

## [1.7.0] - 2026-04-10

### Added

- Open Food Facts 連携の Phase1 として、バーコード検索で市販品を取得し、共有キャッシュ（`shared_products`）経由でメニューへ追加できるようにした。
- 設定画面とバーコード追加UIに、Open Food Facts のデータソース表記を追加した。

### Changed

- JSON エクスポート/インポートが `shared_barcode` を扱えるようになり、市販品参照データを保持できるようにした（既存フォーマットとの互換を維持）。

## [1.6.0] - 2026-04-10

### Added

- マイフード以外のレストランタブをドラッグ操作で並べ替えられるようにし、並び順を保存するようにした。

### Changed

- レストラン並びの基準を `display_order` 優先に変更し、同順位時は従来どおり利用回数順で表示するようにした。

## [1.5.0] - 2026-04-10

### Added

- メニュー追加・編集のグループ名入力で、同じレストラン内の既存グループ名を候補から選べるようにした（新規名の自由入力も可能）。

### Changed

- メニューのグループ名を新規追加・変更するとき、既存グループの表示順（group_order）と整合するよう保存処理を調整した。

## [1.4.2] - 2026-04-10

### Fixed

- モバイルでメニュー追加フォームの入力フォーカス時ズームが起きにくいよう、入力欄の文字サイズを調整した。

## [1.4.1] - 2026-04-10

### Fixed

- 過去の日付を表示しているとき、「今日に戻る」で本日の記録へすぐ戻れるようにした。
- PFCバーで摂取量と目標の数値の間にスペースを入れ、読みやすくした。

## [1.4.0] - 2026-04-10

### Changed

- スマートフォン（狭い画面）向けに文字サイズ・タップ領域を拡大し、ノッチ／ホームインジケータ用にセーフエリア余白を追加。ルートで viewport を明示し、ログイン・サインアップの入力は iOS のフォーカス時ズームを避けるため 16px 相当にした。

## [1.3.1] - 2026-04-10

### Fixed
- マイフード同梱プリセット（初回シード）を更新: バターコーヒーの脂質（100gあたり）と注記、カマンベールを「雪印カマンベール6P」の公式値に差し替え、木綿豆腐を追加。

## [1.3.0] - 2026-04-10

### Added
- ヘッダーのバージョン表記をクリックすると変更履歴（Changelog）を開ける（環境変数 `NEXT_PUBLIC_CHANGELOG_URL` 設定時）。
- ユーザー向けの変更履歴として `CHANGELOG.md` を整備。

### Changed
- 開発運用: `CONTRIBUTING.md`・PR テンプレート・GitHub Actions で Changelog 更新をガイド・チェックするようにした。

## [1.2.3] - 2026-04-10

### Changed
- プリセットの配信経路を `public/presets` の静的配信（`/presets/`）に統一（未使用の `api/presets` ルートを削除）。

## [1.1.0] - 2026-04-09

### Added
- コンビニ向け JSON プリセット（セブンイレブン / ファミリーマート / ローソン）を同梱。
- ヘッダーにバージョン番号表示。

### Changed
- バージョン管理方針（Semantic Versioning）を整備。

## [1.0.0] - 2026-04-09

### Added
- 食事ログ記録、PFCバー、レストラン選択、カート、Supabase保存。
- 認証（Supabase Auth）。
- 日付ナビゲーション（過去ログ閲覧・編集・削除）。
- メニュー管理（追加・編集・削除・ランク・100g換算）。
- JSON エクスポート/インポート（テンプレート + プリセット）。
- ユーザー設定（PFC目標値のカスタマイズ・全データエクスポート）。
