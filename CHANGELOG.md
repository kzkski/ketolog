# Changelog

このプロジェクトの変更履歴です。

基本方針:
- `feat` / `fix` / `refactor` / `docs` の Pull Request では、原則 `CHANGELOG.md` を更新します（差分の有無を CI でチェック。`package.json` の `version` を上げた PR では、同じ版の `## [X.Y.Z]` 見出しの有無も CI でチェック）。
- 詳細な背景や設計意図など長文は [ROADMAP.md](ROADMAP.md) に寄せ、ここにはユーザー視点の要点を短く残します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) を参考にしています。

## [Unreleased]

### Changed

- **Web / Today**: カート内の 1 回あたり g 編集を、横並びの ± ボタン群ではなく `type="number"`（`min` / `step`）の入力とブラウザのスピナーに整理した（モバイルの専用シートは変更なし）。

- **ドキュメント / アーキテクチャ**: Web の食事ログ（楽観 UI・ロールバック）とモバイル（接続時は DB 反映待ち、オフラインは outbox 再送）の対比を `docs/architecture/food-log-sync.md` に整理し、主要実装箇所へ短い案内コメントを追加した（[#304](https://github.com/kzkski/ketolog/issues/304)）。
- **ドキュメント / Native PoC**: `docs/release/v3-native-feasibility.md` に #272 向けの実証 KPI（体感速度・操作完了率・クラッシュ・開発効率）と固定計測手順、暫定評価、Go/No-Go の記録枠を追加した。
- **ドキュメント / Native PoC**: 実証完了に伴い Go を **継続** とし、**デスクトップは Web（ネイティブ対象外）・モバイルは Expo ネイティブ前提**の製品方針を `v3-native-feasibility.md` に追記した（[#263](https://github.com/kzkski/ketolog/issues/263) / [#272](https://github.com/kzkski/ketolog/issues/272)）。
- **ドキュメント / 開発運用**: `CONTRIBUTING.md` と `docs/release/README.md` に Issue ラベル運用の最小ルール（`platform` / `type` / `priority` の必須系統、`epic:*` / `track:*` の推奨運用）を追加した（[#274](https://github.com/kzkski/ketolog/issues/274)）。
- **ドキュメント / リリース運用**: ステージング環境（Supabase + Vercel Preview + OAuth Redirect）の手順を `docs/release/staging-setup.md` に追加し、`docs/release/README.md`・`beta-checklist.md`・`operations-and-costs.md`・`quality-and-ci.md`・`ROADMAP.md`・`README.md` と GitHub Issue [#250](https://github.com/kzkski/ketolog/issues/250)〜[#253](https://github.com/kzkski/ketolog/issues/253)・[#255](https://github.com/kzkski/ketolog/issues/255) を整合させた。
- **ドキュメント**: `ROADMAP.md` を公開向けのマイルストーン構成（v1/v2/v3）へ再編し、市場調査は公開サマリー中心に整理した。詳細な戦略レポートは公開リポジトリ管理の対象外にした。
- **ドキュメント / リリース運用**: `docs/release/README.md` を v2-v3 の運用ハブとして再編し、`beta-checklist.md` / `quality-and-ci.md` に Tracking ひな形（Status/Track/Issue/Owner/DoD）を追加した。v3 向けに `docs/release/v3-native-feasibility.md` を新設し、ネイティブアプリ化の判断観点を整理した。
- **ドキュメント / ベータ運用**: `beta-checklist.md` に Ketovisor 連携向けデータ契約（`contractVersion`・スキーマ・互換ポリシー）を追加し、`docs/release/README.md` と `ROADMAP.md` の v2 優先トラックに反映した（[#248](https://github.com/kzkski/ketolog/issues/248)）。

## [1.64.0] - 2026-05-19

### Added

- **Web / Mobile 分析（[#327](https://github.com/kzkski/ketolog/issues/327)）**: 平均PFCバランスと日次一覧の比率バーを、**カロリー比**（P4・F9・C4 kcal/g）と**重量比**で切り替え可能にした（デフォルトはカロリー比）。選択は端末に保存される。カロリー比時は平均の合計 kcal/日を表示する。

## [1.63.0] - 2026-04-28

### Added

- **Web / Today（[#325](https://github.com/kzkski/ketolog/issues/325)）**: カート展開一覧から「1回あたり」のグラム数を変更できるようにした（±1・±5 と数値入力）。スナップショット行も同様に更新できるよう `TodayClient` のカート更新を拡張した。
- **Mobile / Today（[#325](https://github.com/kzkski/ketolog/issues/325)）**: カート内の g はインライン入力ではなく、タップで開くボトムシートで ±1・±5・数値入力・確定できるようにした。Today 画面に `KeyboardAvoidingView` を入れ、メニューなどの入力時にソフトキーボードで下部が隠れにくくした。

## [1.62.3] - 2026-04-28

### Fixed

- **Mobile / Today（[#323](https://github.com/kzkski/ketolog/issues/323)）**: メニュー行で重量を編集したまま「+」でカート投入すると、未 blur のためデフォルト重量しか渡らなかった問題を修正（入力文字列を確定してから投入し、Web の `MenuItemRow` と同趣旨にした）。投入後は `Keyboard.dismiss()` でソフトキーボードを閉じ、カート操作しやすくした。新規メニュー保存後に `reloadNonce` で店舗の `menu_items` を再取得するようし、タブを行き来しなくても一覧が更新されるようにした。

## [1.62.2] - 2026-04-27

### Fixed

- **Mobile / Today（[#319](https://github.com/kzkski/ketolog/issues/319)）**: メニュー追加モーダルのグループ名候補を内側 `ScrollView` で縦スクロールできるようにし、候補ボックスを `overflow: hidden` でクリップしてメモ欄との重なり表示を防いだ。候補ドロップダウンの最大高さも拡張し（モバイル 280px / Web `max-h-64`）、一度に見える候補件数を増やした。
- **Mobile / Today（[#320](https://github.com/kzkski/ketolog/issues/320)）**: 展開カートに画面高ベースの `maxHeight` を導入し、行一覧のみを `flex` + `ScrollView` でスクロールする構造へ変更。小さい画面でも下部の「記録する」ボタンへ到達しやすくした。空カート時の早期 return の後に `useMemo` を置いていたため初回投入で「Rendered more hooks than during the previous render.」になる不具合を修正した（フック呼び出し順を一定にした）。展開パネルに固定高がない状態で行一覧に `flex: 1` を使っていたため一覧の高さが 0 になり行が見えない問題を、行 `ScrollView` に画面高に応じた明示 `maxHeight` を与える形に改めた。加えて `TodayScreen` 側の `menuPanelSlot` の `minHeight` を 0 にして、展開カート表示時にメニュー領域が縮まずフッターが画面外へ押し出されるレイアウトを解消した。モバイル / Web ともにカート上部の重複情報（「〜に記録」「PFC サマリ」「記録する食事」ラベル）を整理し、一覧表示領域を優先した。あわせてヘッダー右上に「空にする」を追加し、カート内容を一括で空にできるようにした。

## [1.62.1] - 2026-04-27

### Fixed

- **Web / Mobile / 共有商品（[#317](https://github.com/kzkski/ketolog/issues/317) / [#318](https://github.com/kzkski/ketolog/issues/318)）**: Open Food Facts の `fields` に `serving_size` を含め、`shared_products` の serving 列に反映されるようにした。手動登録（OFF 未ヒット）ではフォームの「1回の量 (g)」を `shared_products` の serving へ引き渡す。既存メニュー編集で同条件下にバーコードを付けて保存するとき、先に `shared_products` を作ってから `menu_items` を更新する RPC を追加し、外部キー違反で失敗しなくした。

## [1.62.0] - 2026-04-26

### Added

- **Web / Mobile / 分析（[#314](https://github.com/kzkski/ketolog/issues/314)）**: 分析画面に「すべて・朝食・昼食・夕食・間食」の食事タイプフィルタを追加し、選択タイプだけで平均PFC・日次推移・日別一覧・Top10を再集計できるようにした。期間JSONのエクスポート/共有にも選択中 `mealTypes` を含め、Webとモバイルで同じ条件を再現できるようにした。

## [1.61.0] - 2026-04-26

### Changed

- **Web / Mobile / Today（[#312](https://github.com/kzkski/ketolog/issues/312)）**: メニュー編集にバーコード表示を追加し、既存バーコードがあるメニューは表示専用（再スキャン不可）にした。バーコード未登録のメニューだけ編集画面からカメラ起動で初回登録でき、編集時はQR読み取りを無効化した。保存時の重複バーコードエラー文言も Web / iOS で統一した。

## [1.60.0] - 2026-04-25

### Changed

- **Mobile / Today（[#310](https://github.com/kzkski/ketolog/issues/310)）**: 画面全体の外側 `ScrollView` を廃止し、`topHeader`・日付ナビ・フェーズ・PFC・記録パネルを固定表示にした。`TodayMenuPanel` はモード/店舗タブ/検索を固定し、メニュー行エリアのみを縦スクロール化して pull-to-refresh を移設。カートドック展開時でも末尾操作がしやすいように下余白を追加した。

## [1.59.0] - 2026-04-24

### Fixed

- **Web / Today**: `import-export` の `ImportData` 型の再エクスポートを `@ketolog/domain` 直指定にし、dev / Server Actions で `ReferenceError: ImportData is not defined` になる問題を解消（[#303](https://github.com/kzkski/ketolog/issues/303)）。

### Changed

- **Web / Today**: 「お店を追加」各ドロワー（手入力 / JSON インポート / プリセット）の**見出し**を、モバイル同様**中央揃え**にし、**キャンセル**を右上に固定（`TodayClient`）。
- **Mobile / Today（[#303](https://github.com/kzkski/ketolog/issues/303)）**: 「お店を追加」の**最初の3択**は Web の選択シート同様、**右上にキャンセルは出さない**（背景タップ等で閉じる）。**手入力 / JSON / プリセット**の各子画面は右上「キャンセル」で全体を閉じる（`AddRestaurantModal`）。
- **Web / Mobile / Today**: プリセット一覧の**折りたたみ前の表示件数**を 5 件から **10 件**に変更（10 件超で「さらに表示」、将来のプリセット増加に備え可変）。

### Added

- **Mobile / Today（[#303](https://github.com/kzkski/ketolog/issues/303)）**: 「お店を追加」を Web の Today と揃え、**手入力**（店名＋4カテゴリ）/ **JSONから新規インポート**（`importRestaurantData` と同じ Supabase 操作をクライアント実装）/ **プリセット**（`public/presets` 同梱、オフライン優先。Web 追加時は同梱の更新要）の3経路に対応。共有シーマ型は `@ketolog/domain/restaurant-import`。

## [1.58.0] - 2026-04-24

### Changed

- **Web / Today**: 食事区分（朝・昼・晩・間食）の**タブ行**と、右端の**メニュー追加用「＋」**を表示しないようにした。記録先の食事は**カート内の「記録する食事」**で選び、メニュー品目の追加は各店舗の「＋ メニューを追加」・成分表からの導線・お店の「＋」を使う（モバイル版 Today と同趣旨の整理）。関連: [#302](https://github.com/kzkski/ketolog/issues/302)
- **Web / Today（[#302](https://github.com/kzkski/ketolog/issues/302)）**: 食品成分表（文科省）タブの**名称検索**を、お気に入り・店舗メニューと同様に**パネル最上段**にし、検索欄のスタイルも `MenuItemList` 側のメニュー検索に揃えた（`StandardFoodPanel`）。

### Added

- **Web / Today（[#302](https://github.com/kzkski/ketolog/issues/302)）**: お気に入りタブ・店舗メニュータブに、モバイル `TodayMenuPanel` と同様のメニュー名検索（部分一致・大文字小文字無視）を追加した（`MenuItemList` / `filterMenuGroupsByBrowseQuery`）。
- **ドキュメント**: Web / モバイルの Today まわり（食事の選び方・カート・メニュー登録導線）の対応表を `docs/ux/today-clients.md` に追加した。

## [1.57.0] - 2026-04-24

### Added

- **Mobile / 更新配布（[#293](https://github.com/kzkski/ketolog/issues/293)）**: 本番相当で `expo-updates` が有効なビルドでは、起動直後（短い遅延後）とアプリのフォアグラウンド復帰時に EAS Update の確認・取得を行い、新しい JavaScript バンドルがあれば**再読み込み**を案内する（`__DEV__` や無効ビルドでは no-op。同一セッションは冷却あり）。実装は `useEASUpdatePrompt`（`app/_layout`）。

## [1.56.0] - 2026-04-24

### Added

- **Mobile / 分析・法務（[#293](https://github.com/kzkski/ketolog/issues/293)）**: 未送信の食事下書きが1件以上ある場合のみ、分析画面に「集計に含まれない」旨の注意を表示する。`EXPO_PUBLIC_KETOLOG_WEB_ORIGIN` または `EXPO_PUBLIC_KETOLOG_LEGAL_*_URL` で解決した利用規約・プライバシーポリシーを、ログイン・新規登録・Today の設定からブラウザで開ける（https のみ）。

### Changed

- **Mobile / 法務・分析補足**: 法務 URL 解決は `apps/mobile/lib/ketolog-legal-urls.ts` に集約。分析の未送信下書きの有無の再取得には `@react-navigation/native` の `useFocusEffect` を使う。

## [1.55.0] - 2026-04-24

### Added

- **Mobile / 分析（[#293](https://github.com/kzkski/ketolog/issues/293)）**: 設定の「分析」から専用画面へ開き、過去7日・30日・カスタム（最大90日）の食事ログ取得・平均PFC・日次折れ線グラフ・日別一覧・Top10・期間JSONの共有エクスポートを利用できる。画面上部の「閉じる」で Today に戻る。Web の分析と同じ Supabase クエリと `@ketolog/domain/insights` の集計である。

### Changed

- **Shared / domain**: `buildInsights`・プリセット期間・型を `@ketolog/domain/insights` に切り出し、Web の `src/lib/insights.ts` は同モジュールの再エクスポートにした。

## [1.54.0] - 2026-04-24

### Added

- **Mobile / 設定（[#292](https://github.com/kzkski/ketolog/issues/292)）**: Web の設定ドロワー相当として、PFC 目標セット（セット名の直編集・ラジオで表示中セット切替・保存）、全期間の食事ログを含む全データ JSON の共有エクスポート、データソース（Open Food Facts）リンク、ログアウトを `TodaySettingsModal` に実装した。
- **Mobile / Today（[#292](https://github.com/kzkski/ketolog/issues/292)）**: 店舗メニュー一覧下に Web `MenuItemList` と同様の「JSONでエクスポート」「JSONでメニューを追加」「このお店を削除」を追加した（`expo-document-picker` / `expo-sharing` / `expo-file-system`）。削除時はカート内の当該店舗行も除去する。
- **Shared / domain**: 単一店舗 JSON v1 のエクスポート組み立て・テンプレート・パースを `@ketolog/domain/restaurant-json-v1` に切り出した。

### Changed

- **Web / Today**: `TodayClient` の単一店舗 JSON 周りを上記ドメインモジュールの利用に差し替えた（挙動は従来と同一）。
- **Mobile / Today**: 設定は「Web で行ってください」案内から、上記ネイティブ設定モーダルに差し替えた。

## [1.53.0] - 2026-04-23

### Added

- **Mobile / Today**: メニュー編集モーダルに、Web のメニュー項目ドロワーと同じ内容の共有用 QR コードを表示する（`react-native-qrcode-svg`）。
- **Mobile / Today**: 店舗タブ行を Web の `SortableRestaurantTabs` に近い見た目（下線で選択・左の ⣿ を長押しでドラッグ）にし、`display_order` を Supabase に保存する並べ替えに対応した（`react-native-draggable-flatlist` / `reorderRestaurantsMobile`）。
- **Mobile / 起動**: `auth.getSession()` が返らないときにネイティブスプラッシュのまま固まらないよう、15 秒タイムアウトとスプラッシュの 4 秒フェイルセーフを入れた。

### Changed

- **Mobile / Today**: 店舗タブ行の `DraggableFlatList` が横方向に広がりすぎて「お店を追加」の＋が画面外に押し出されることがあったため、`minWidth: 0` のスロットで包んで常に＋が見えるようにした。
- **Mobile / Today**: お気に入り・成分表を枠付きボタン風からやめ、店舗タブと同系統の下線選択のミニタブにし、行の左右パディングとギャップを詰めて店名タブの幅を確保した。
- **Mobile / Today（成分表）**: タブアイコンを `Ionicons` の虫眼鏡に変更、検索欄をお気に入り・店舗と同じく一番上に統一、成分表パネルから「追加先のお店」選択を廃止（メニュー追加モーダルで店を選ぶ前提で `registerRestaurantIdHint: null` を渡す）。
- **Mobile / Today**: 店舗タブの店名を長押しして「名前を変更」（Web のタブコンテキストメニュー相当）、`updateRestaurantNameMobile` で Web と同じ店名・お気に入りグループ名の更新を行う。
- **Mobile / Today**: カートに入れたときにドックを自動展開しない（既定は閉じたまま）。上部 PFC バーは「記録済み＋カート内」を合算して表示し、カート変更のたびに即反映されるようにした。

## [1.52.0] - 2026-04-23

### Added

- **Mobile / Today**: Web のメニュー項目ドロワー相当の `MenuItemEditorModal`（メニュー追加・編集・削除、栄養素の表示単位、登録先・今すぐ記録・カート・メニューに登録）。
- **Mobile / Today**: 店舗タブ行末尾の「＋」で `AddRestaurantModal` から店舗を追加し、追加直後にその店タブへ切り替え（Web `RestaurantPanel` と同様の配置）。
- **Mobile / Today**: メニュー一覧下の破線「＋ メニューを追加」（Web `MenuItemList` と同様）。
- **Mobile / Today**: カートの未登録行用 `snapshotDraft` と、記録時の `menu_item_id: null` 付与。

### Changed

- **Mobile / Today**: 記録パネルの「手入力」からも `MenuItemEditorModal` を開き、Web の食事区分横「＋」と同じ導線に統一した。
- **Mobile / Today**: メニュー行の編集は品名・PFC ブロックのタップのみ（Web `MenuItemRow` と同等）。専用「編集」ボタンを廃止した。
- **Mobile / Today**: 記録ヘッダーは「手入力」のみに整理した。
- **Mobile / Today**: 食事ログの追加（プリフィル）・記録の編集は `FoodLogEntryModal`、メニュー CRUD は `MenuItemEditorModal` に分離した。
- **Mobile / MenuPickModal**: お気に入りタブ・星トグル・店舗並び（`display_order`）を Today 周りと揃えた。

## [1.51.0] - 2026-04-23

### Added

- **Mobile / Today（#287 子）**: JST の日付ナビ（未来日不可）、選択日の `food_log` 取得、手入力時の `source` を Web と同じスナップショット店 UUID に統一（`getOrCreateSnapshotRestaurant` 相当）。過去日表示時は「今日」チップで当日へ戻れるようにした（[#289](https://github.com/kzkski/ketolog/issues/289)）。

### Fixed

- **Mobile / Today**: Hermes / iOS で日付ナビの曜日が「？」になる問題を、`Intl` の曜日表記に依存しない暦計算へ切り替えて解消した（[#289](https://github.com/kzkski/ketolog/issues/289)）。

### Changed

- **Shared / domain**: Today 向けに `formatNavDate` を追加し、モバイルの日付ラベルで利用するようにした（[#289](https://github.com/kzkski/ketolog/issues/289)）。

## [1.50.0] - 2026-04-23

### Added

- **Mobile / アプリ骨格（#287 子）**: Expo Router による `(auth)` / `(app)` グループ、ログイン・新規登録（メール・Google）、深いリンク用 `auth/callback`、セッション共有の `AuthSessionProvider` を追加した（[#288](https://github.com/kzkski/ketolog/issues/288)）。

## [1.49.1] - 2026-04-23

### Fixed

- **Mobile / Supabase 設定**: TestFlight 実機で `Supabase 未設定` になる問題を修正。接続先解決をデバイス判定依存から外し、`EXPO_PUBLIC_SUPABASE_PRODUCTION_*` 優先 + `EXPO_PUBLIC_SUPABASE_*` フォールバックで安定化した（[#271](https://github.com/kzkski/ketolog/issues/271)）。
- **CI / iOS 配布自動化**: `Mobile iOS TestFlight Release` 実行時に required な Supabase env を EAS production 環境へ同期してから build するようにし、Actions 経由でも起動設定が欠けないようにした（[#271](https://github.com/kzkski/ketolog/issues/271)）。

## [1.49.0] - 2026-04-23

### Added

- **Mobile / 配布運用**: Expo iOS の `eas.json` と配布用 npm scripts を追加し、GitHub Actions から `build -> TestFlight submit` を実行できる自動化ワークフローを追加した（[#271](https://github.com/kzkski/ketolog/issues/271)）。
- **ドキュメント / リリース運用**: `docs/release/ios-testflight-distribution.md` を新設し、EAS/TestFlight の再現手順・失敗時切り分け・Actions 運用を整理した。

### Changed

- **Mobile / 接続安定性**: 実機の Supabase 接続で `EXPO_PUBLIC_SUPABASE_PRODUCTION_*` を優先しつつ、既存の `EXPO_PUBLIC_SUPABASE_*` へフォールバックするようにして TestFlight の設定差分に強くした。
- **Mobile / バージョン表示**: `apps/mobile/app.config.ts` の `version` をルート `package.json` と同期し、TestFlight 表示が本体バージョンと一致するようにした。
- **Mobile / アイコン**: iOS/Web のアイコン資産を更新し、TestFlight 実機確認時の見え方を調整した。

## [1.48.0] - 2026-04-23

### Added

- **Mobile / 同期**: オフライン時は食事追加を端末下書きに保持し、オンライン復帰後に手動で再送できるようにした。クライアント UUID を `food_log.id` に使い再送時の二重登録を防ぐ。方針は `docs/mobile/sync-policy.md` に記載（[#270](https://github.com/kzkski/ketolog/issues/270)）。

## [1.47.0] - 2026-04-23

### Added

- **Mobile / Today**: 「メニュー」から Web で登録した店舗・メニューを選び、品目名・標準分量・100g あたり PFC を反映した状態で食事を追加できるようにした。保存時は Web と同様に `menu_item_id` と店舗 UUID を `source` に付与する（[#269](https://github.com/kzkski/ketolog/issues/269)）。

### Fixed

- **Mobile / メニュー選択**: `restaurants.display_order` 列が無いデータベースでも店舗一覧が取得できるよう、取得列と並び替えを見直した（[#269](https://github.com/kzkski/ketolog/issues/269)）。

## [1.46.0] - 2026-04-23

### Changed

- **Mobile / Supabase**: `expo-constants` の `Constants.isDevice` に応じて接続先を切り替え。シミュレータ・エミュレータでは `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`（ローカル想定）、実機では `EXPO_PUBLIC_SUPABASE_PRODUCTION_URL` / `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY`（本番想定）を使用する。`App.tsx` の未設定案内と `apps/mobile/README.md`・`.env.example` を更新した。

## [1.45.0] - 2026-04-23

### Added

- **Mobile / Today**: 当日 `food_log` の一覧表示、手入力での追加（品目・食事区分・分量 g・100g あたり PFC）、分量と食事区分の編集（Web と同様の PFC 比率による再計算）、削除（確認ダイアログ）。失敗時はトーストとモーダル内の再試行。Web で登録した行も同じ一覧に表示される（[#268](https://github.com/kzkski/ketolog/issues/268)）。

### Changed

- **Shared / domain**: `pfcGramsFromNullablePer100` を `packages/domain/src/pfc.ts` に追加し、`src/lib/menu-item-pfc.ts` から再エクスポートするよう整理した（[#268](https://github.com/kzkski/ketolog/issues/268)）。

## [1.44.0] - 2026-04-23

### Added

- **Mobile / Today（MVP / iOS）**: ログイン後のホームを `TodayScreen` にし、JST 日付表示・3 フェーズ切替（`user_settings` 同期）・当日 `food_log` 合算の PFC バー・`SafeAreaProvider` ／ `SafeAreaView`（ノッチ等）を実装。詳細設定は Web 版案内＋モーダルからログアウト（[#267](https://github.com/kzkski/ketolog/issues/267)）。

### Fixed

- **Mobile / Monorepo**: ルート `package.json` の誤った `ios` / `android`（リポジトリ直下で `expo run:*` を実行し `../../App` 解決エラーになる）を削除し、`mobile:ios:run` を `npm --prefix apps/mobile run run:ios` に変更。`apps/mobile` に `run:ios` / `run:android` スクリプトを追加した（[#267](https://github.com/kzkski/ketolog/issues/267)）。
- **Mobile / prebuild**: `app.config.ts` に `ios.bundleIdentifier` と `android.package` を明示（未設定時に `expo prebuild` / `expo run:ios` がメッセージなしで終了するのを防ぐ）。紛らわしいルートの `app.json` を削除し、`apps/mobile/ios`・`android` を `.gitignore` に追加した（[#267](https://github.com/kzkski/ketolog/issues/267)）。
- **Mobile / Today**: ヘッダーに Web と同じロゴ（`public/icons/icon-header.png` を `assets/brand-header.png` として同梱）を表示し、設定を `@expo/vector-icons`（`settings-outline`）に変更（[#267](https://github.com/kzkski/ketolog/issues/267)）。
- **Mobile / アセット**: ホーム画面（アプリアイコン）・スプラッシュ・アダプティブアイコン・favicon を `public/icons` の Ketolog ロゴ（`icon-512.png` / `icon-192.png`）で差し替え、スプラッシュと Android 適応型の背景色をロゴの紺（`#0d2344`）に揃えた（[#267](https://github.com/kzkski/ketolog/issues/267)）。
- **Mobile / スプラッシュ**: `expo-splash-screen` を依存に追加し、`app.config` の `plugins` でネイティブ向けスプラッシュを明示。エントリで `preventAutoHideAsync`、セッション確認完了後に `hideAsync` するよう `App` / `index` を調整。Expo Go の「バンドル構築中」画面と区別するため、ネイティブ確認用にルートから `npm run mobile:ios:run`（`expo run:ios`）を README に追記した（[#267](https://github.com/kzkski/ketolog/issues/267)）。

## [1.43.1] - 2026-04-23

### Fixed

- **Mobile / Expo（モノレプ）**: リポジトリルートで誤った `App` 解決になる起動手順を `npx expo start apps/mobile` に揃え、Web と別バージョンの `react` が混在する問題を `overrides` および Metro の `extraNodeModules` 解消で直した。トップ `README` と `apps/mobile/README` に注意を追記（[#266](https://github.com/kzkski/ketolog/issues/266)）。

## [1.43.0] - 2026-04-23

### Added

- **Mobile PoC / 認証**: `apps/mobile` に Supabase Auth（Email+Password、Google OAuth、PKCE + in-app ブラウザ、AsyncStorage でのセッション永続化、未ログインはログイン画面）を追加した。`app.config.ts` で `scheme: ketolog`、`.env.example`・`README` に Redirect URL と Web 共存の注意を記載した（[#266](https://github.com/kzkski/ketolog/issues/266)）。

## [1.42.0] - 2026-04-23

### Added

- **Mobile PoC / 共有パッケージ**: `packages/domain`（`pfc` / `date` / `meal-timezone`）と `packages/types`（共有型の再エクスポート）を追加し、Web の import を切り替えた。Expo 側は Metro のモノレポ設定と `App.tsx` からの import で同パッケージを参照できるようにした。import ルールを `AGENTS.md` と `CONTRIBUTING.md` に追記（[#265](https://github.com/kzkski/ketolog/issues/265)）。

## [1.41.0] - 2026-04-21

### Added

- **Mobile PoC / Expo**: `apps/mobile` に Expo（TypeScript）アプリを初期追加し、ルートからの起動コマンド（`mobile:start` / `mobile:ios`）と最小チェック（`mobile:typecheck`）を整備した。あわせて `apps/mobile/README.md` に再現可能なセットアップ手順を追加し、mobile 変更時のみ走る GitHub Actions（typecheck）を新設した（[#264](https://github.com/kzkski/ketolog/issues/264)）。

## [1.40.0] - 2026-04-20

### Changed

- **Today / 初期ロード最適化**: `/today` の初期サーバー取得からお気に入り取得を外し、初回描画後にクライアントで自動遅延取得する方式へ変更した。初期表示（お気に入りタブ）では「お気に入りを読み込んでいます...」を表示し、失敗時は再試行できるようにした（[#261](https://github.com/kzkski/ketolog/issues/261)）。

## [1.39.0] - 2026-04-20

### Changed

- **Today / 初期ロード最適化**: `/today` で全店舗メニューを初回一括取得せず、初期表示に必要な最小データのみを先に読み込むようにした。店舗タブを開いたタイミングで該当店舗のメニューを遅延取得し、取得中表示・エラー時の再試行導線を追加した（[#257](https://github.com/kzkski/ketolog/issues/257)）。

## [1.38.7] - 2026-04-20

### Fixed

- **Today / 本番互換性**: `/today` の初期取得クエリで、古いスキーマに `display_order` / `standard_food_code` が存在しない場合のフォールバックを追加した。列限定のまま互換運用できるようにし、本番でメニュー一覧が空になる回帰を防止した。

## [1.38.6] - 2026-04-20

### Fixed

- **Today / 初期ロード**: `/today` の初期データ取得で `select('*')` をやめ、必要列に限定した。あわせてお気に入り取得時の `menu_items(*)` ネストを廃止し、初期ペイロードの重複を削減した（[#256](https://github.com/kzkski/ketolog/issues/256)）。

## [1.38.5] - 2026-04-15

### Changed

- **運用**: 更新通知フローの実機確認用にバージョンを 1.38.5 へ更新した（[#244](https://github.com/kzkski/ketolog/issues/244)）。

## [1.38.4] - 2026-04-15

### Fixed

- **Today / 更新通知**: 更新シートの「更新する」押下時に確認ダイアログを出さないようにし、押下後すぐ `更新中...` 表示へ切り替わる体験に統一した（[#242](https://github.com/kzkski/ketolog/issues/242)）。

## [1.38.3] - 2026-04-15

### Fixed

- **Today / 更新通知**: 更新シートの「更新する」ボタン押下時に、即座に `更新中...` 表示へ切り替えて無効化するようにした。二重タップを防ぎ、タップ受付が視覚的に分かるよう改善した（[#239](https://github.com/kzkski/ketolog/issues/239)）。
- **Today / 設定**: 設定ドロワーの「分析画面を開く」ボタンで、タップ直後に `開いています...` 表示へ切り替えて再タップを抑止するようにした。押下が分かりづらい問題を改善した（[#241](https://github.com/kzkski/ketolog/issues/241)）。

## [1.38.2] - 2026-04-15

### Fixed

- **Today / 更新通知**: 更新通知の文言を「タップで詳細」に変更し、更新処理の実行前に確認ダイアログを追加した。想定外に直接更新処理が呼ばれても、確認なしで即時再読み込みしないようにした（[#237](https://github.com/kzkski/ketolog/issues/237)）。

## [1.38.1] - 2026-04-15

### Fixed

- **Today / 更新通知**: ヘッダー中央の更新メッセージが省略される場合でも、タップで下部シートに詳細文を全文表示できるようにした。シート内の「更新する」から従来どおり再読み込み更新を実行できる（[#235](https://github.com/kzkski/ketolog/issues/235)）。

## [1.38.0] - 2026-04-15

### Added

- **開発**: Vitest を導入し、`npm test` で `src/lib` のユニットテスト（日付・PFC・セマンティックバージョン比較・ダイエットフェーズ・食事区分・メニュー一覧ソートなど）を実行できるようにした（[#217](https://github.com/kzkski/ketolog/issues/217)）。
- **開発**: GitHub Actions の CI で Pull Request と `main` への push 時に `npm test`（Vitest）を実行するようにした（[#217](https://github.com/kzkski/ketolog/issues/217)）。

### Changed

- **パフォーマンス（Today）**: `next.config.ts` に `experimental.optimizePackageImports` を追加し、メニュー追加・編集ドロワー（`MenuItemDrawer`）を `next/dynamic` で遅延読み込みするようにした。お店タブの並べ替えは従来どおり `RestaurantTabsLazy` 経由で dnd-kit を遅延読み込み（[#223](https://github.com/kzkski/ketolog/issues/223)）。
- **内部（Today）**: メニュー追加・編集ドロワーを `ItemDrawer.tsx`（`MenuItemDrawer`）に、お気に入りタブの空状態案内を `FavoritesPanel.tsx` に切り出した。メニュー PFC 換算は `src/lib/menu-item-pfc.ts` に集約。お気に入りの表示・トグル・ドロワー操作の挙動は従来どおり（[#222](https://github.com/kzkski/ketolog/issues/222)）。
- **内部（Today）**: `TodayClient` からレストランタブ列を `RestaurantPanel` に、メニュー一覧・成分表パネル・店ごとの JSON 導線を `MenuItemList` に、店・メニュー・お気に入りタブ周りの状態と処理を `useRestaurantState` に切り出した。並び替え・編集・追加などの挙動は従来どおり（[#221](https://github.com/kzkski/ketolog/issues/221)）。
- **内部（Today）**: `TodayClient` からカート UI（折りたたみバー・展開パネル・記録ボタン）を `CartPanel` に、日付切替・ログ一覧・削除・再取得の状態と処理を `useMealLog` に切り出した。画面の挙動は従来どおり（[#220](https://github.com/kzkski/ketolog/issues/220)）。
- **内部（Today）**: `TodayClient` からブランド行・日付ナビ・ダイエットフェーズ・PFC バー・ヘッダーヒント全文ダイアログを `PfcHeader` に、メニュー追加ドロワー内のバーコード／QR 読み取りを `BarcodeScanner` に切り出した。見た目と挙動は従来どおりで、状態は親から props で渡す（[#219](https://github.com/kzkski/ketolog/issues/219)）。
- **開発**: `TodayClient` の状態一覧・移管先・props フロー・Ph-2 分割用の props 案を `docs/plans/issue-213-today-state-design.md` に整理し、Ph-2a〜2d（[#219](https://github.com/kzkski/ketolog/issues/219)〜[#222](https://github.com/kzkski/ketolog/issues/222)）向けに当該設計書・実装計画書からの必須参照を明示した（[#218](https://github.com/kzkski/ketolog/issues/218)）。
- **内部**: PFC（g）の合算を `src/lib/pfc.ts` の `sumPfc()` に集約し、Today・食事ログ取得・分析集計の重複加算を整理した（[#216](https://github.com/kzkski/ketolog/issues/216)）。
- **Today / コード整理**: Server Actions の参照先を `src/app/today/actions/*` の責務別エントリへ分割し、食事区分定数と JST 日付ユーティリティを `src/lib/constants/meal.ts` / `src/lib/date.ts` に集約した（[#215](https://github.com/kzkski/ketolog/issues/215)）。
- **開発運用**: コードベース責務分割・パフォーマンス改善の設計をドキュメント化した（`AGENTS.md` / `CONTRIBUTING.md` にディレクトリ配置規約・Server Actions import ルールを追記、`ROADMAP.md` に技術的改善セクションを追加、`docs/plans/issue-213-refactor-codebase.md` を新規作成）（[#213](https://github.com/kzkski/ketolog/issues/213)）。
- **ROADMAP**: Phase 2-2 に、[Issue #54](https://github.com/kzkski/ketolog/issues/54)（最近スキャン・検索した市販品の一覧 UI）と既存の OFF／メニュー／お気に入りとの関係を追記した（[#212](https://github.com/kzkski/ketolog/pull/212)）。
- **開発運用**: `CONTRIBUTING.md` / `AGENTS.md` / `.cursor/rules/github-flow.mdc` に、`gh pr merge --admin` などブランチ保護バイパス操作の原則禁止と、例外時の事前承認必須ルールを追加した（[#186](https://github.com/kzkski/ketolog/issues/186)）。
- **開発運用**: 通常マージ失敗時の待機手順（停止→ブロッカー確認→60〜120秒待機→再確認→通常マージ再試行）を追加し、待機前に `--admin` へ進まない運用を明文化した（[#186](https://github.com/kzkski/ketolog/issues/186)）。

## [1.37.1] - 2026-04-15

### Fixed

- **Today / お気に入り**: メニューの☆でお気に入りに追加しても、再読み込みすると消えてしまうことがあった不具合を修正した（楽観更新の直後にサーバー保存が走らない経路を `flushSync` で塞ぐ）。

## [1.37.0] - 2026-04-15

### Added

- **Today / PWA**: 本番でリモートの `CHANGELOG.md`（raw）と実行中バージョンを比較し、新しい版があるときヘッダー中央に要約と更新導線を表示する。タップで Service Worker を更新して再読み込みできる（`NEXT_PUBLIC_CHANGELOG_URL` から raw を導出できる場合、または `NEXT_PUBLIC_CHANGELOG_RAW_URL` 指定時）（[#208](https://github.com/kzkski/ketolog/issues/208)）。

### Changed

- **Today / ヘッダー**: ブランド（アイコンと「Ketolog」）をタップすると記録（`/today`）へ戻る。バージョン表記のみ変更履歴（Changelog）を開く（[#208](https://github.com/kzkski/ketolog/issues/208)）。
- **分析画面（/insights）**: モバイルで期間プリセット・カスタム説明・DL・日付入力を横詰めし、開始日・終了日のはみ出しを抑える。セーフエリア用の上下余白を追加した（[#208](https://github.com/kzkski/ketolog/issues/208)）。
- **PWA**: `public/sw.js` が `SKIP_WAITING` メッセージで待機中の Service Worker を有効化できるようにした（[#208](https://github.com/kzkski/ketolog/issues/208)）。

## [1.36.2] - 2026-04-15

### Fixed

- **Today**: お気に入り星の連打で、遅く返った非同期結果により表示が一瞬戻ったり星の状態が逆転する問題を修正した。同一メニュー項目ごとに世代管理とサーバー更新の直列化を行う（[#210](https://github.com/kzkski/ketolog/issues/210), [#204](https://github.com/kzkski/ketolog/issues/204)）。

## [1.36.1] - 2026-04-15

### Fixed

- **分析画面（/insights）**: 日次PFC推移グラフのツールチップで、系列名がアルファベット順（C→F→P）になっていた問題を修正した。P→F→C の順で表示する（[#203](https://github.com/kzkski/ketolog/issues/203)）。

## [1.36.0] - 2026-04-15

### Changed

- **Today / メニュー**: メニュー追加・編集ドロワーの栄養素トグル初期値を「1回分」にした。一覧と同様に「その時点の 1 回の量」を基準に入力でき、保存は従来どおり 100g 換算で記録する（[#206](https://github.com/kzkski/ketolog/issues/206)）。

## [1.35.2] - 2026-04-14

### Fixed

- **Today**: お気に入りボタン・食事記録の削除・食事記録の保存を楽観的更新に変更し、操作後の UI 反映を即時化した。サーバーエラー時は元の状態にロールバックする（[#204](https://github.com/kzkski/ketolog/issues/204)）。

## [1.35.1] - 2026-04-14

### Fixed

- **分析画面（/insights）**: Vercel 本番ビルド時に `recharts` の型差異で TypeScript エラーになりデプロイ失敗する問題を修正した。凡例カスタムとツールチップの型互換を調整して、環境差異があってもビルドが通るようにした（[#201](https://github.com/kzkski/ketolog/pull/201)）。

## [1.35.0] - 2026-04-14

### Added

- **分析画面（/insights）**: 過去7日を初期表示に、過去30日・カスタム（最大90日）で期間を切り替え、日次PFC推移グラフ・日別ログ（初期は全折りたたみ）・よく食べたアイテムTop10（回数）を確認できる専用ページを追加。期間内ログのJSONダウンロードにも対応（[#200](https://github.com/kzkski/ketolog/issues/200)）。
- **Today / 設定**: 設定ドロワーに分析画面への導線を追加し、記録画面から期間分析へ遷移しやすくした（[#200](https://github.com/kzkski/ketolog/issues/200)）。

## [1.34.3] - 2026-04-14

### Fixed

- **Today / メニュー**: メニュー共有 QR を読んだとき、サーバーへ即保存せず **追加フォームに名前・PFC・量・ランク・メモなどを転記**するようにした。確定は「メニューに登録」「カートへ」「今すぐ食事ログに記録」と同じ流れで行う（[#198](https://github.com/kzkski/ketolog/issues/198)）。

## [1.34.2] - 2026-04-14

### Fixed

- **Today / メニュー**: QR でメニューを取り込んだあと「メニューを追加」ドロワーがすぐ閉じないようにした。取り込み成功メッセージをドロワー内に表示し、カメラは停止したままにする（[#198](https://github.com/kzkski/ketolog/issues/198)）。

## [1.34.1] - 2026-04-14

### Fixed

- **Today / メニュー**: QR で取り込んだメニューが一覧に出ないことがあった問題を修正した。取り込み先のお店タブへ自動で切り替える（お気に入り表示中など、追加先と表示タブがずれていたのが原因）（[#198](https://github.com/kzkski/ketolog/issues/198)）。

## [1.34.0] - 2026-04-14

### Added

- **Today / メニュー**: メニュー編集ドロワーから QR で共有（PNG 保存・画像コピー）。「メニューを追加」のカメラで共有 QR を読み取ると、選択中のお店に 1 件インポート。ペイロードはクライアント内 JSON（`v` / `kind` で将来拡張可能）。データが大きすぎて QR を生成できない場合は理由を表示。ネイティブ `BarcodeDetector` は QR を含む形式を指定、ZXing フォールバックは `QR_CODE` を追加（[#198](https://github.com/kzkski/ketolog/issues/198)）。

## [1.33.0] - 2026-04-13

### Added

- **Today**: レストランタブ列の「お気に入り」の先頭に ★/☆（メニュー行のお気に入りトグルと同じ記号）、「成分表」の先頭に虫眼鏡 SVG を表示して、固定タブを一覧の店名タブと区別しやすくした。ラベルは太字、虫眼鏡は線幅をやや太くしてテキストとの重みを揃えた（[#196](https://github.com/kzkski/ketolog/issues/196)）。
- **Today**: `sm` 以上で成分表タブの表記を「食品成分表2023」にした（「文科省表2023」から変更し、内容が伝わりやすくした）。

## [1.32.1] - 2026-04-14

### Fixed

- **Today / バーコード**: 手動共有（`manual_entry`）の商品を後からバーコードで読んだときも、メモ欄の初期文言を「OFF連携」ではなく手動共有の説明文に統一した（[#194](https://github.com/kzkski/ketolog/issues/194)）。

## [1.32.0] - 2026-04-13

### Added

- **Today / バーコード**: Open Food Facts にないバーコードでも、商品名と栄養を入力して保存すると `shared_products` に手動登録され（`source` は `manual_entry`、`created_by` で記録）、同じバーコードを後から読んだ利用者にもヒットしやすくなった。共有行とメニュー行はデータベースのトランザクションでまとめて追加する（[#191](https://github.com/kzkski/ketolog/issues/191)）。

## [1.31.1] - 2026-04-13

### Fixed

- **Today**: メニュー一覧を `rank`（◎〜✕）順で安定表示するようにした。`order_count` には依存せず、同ランク内は名前順などで決定的に並べる（[#188](https://github.com/kzkski/ketolog/issues/188)）。

## [1.31.0] - 2026-04-13

### Added

- **プリセット**: コンビニ統合プリセットにカップヌードルPRO 4品・どん兵衛PRO 1品を追加した。PFC は麺量（60g／うどん66g）基準の 100g 換算値とし、注記に 1食あたり目安を併記（[#175](https://github.com/kzkski/ketolog/issues/175)）。

## [1.30.6] - 2026-04-13

### Fixed

- **監視**: `/api/health` が存在しない `shared_products.id` を参照して 503 になっていたのを、主キー列 `barcode` を参照するように修正した。

## [1.30.5] - 2026-04-13

### Fixed

- **監視**: `/api/health` の Supabase 疎通確認を `HEAD`（`select(..., { head: true })`）から **`GET` + `limit(1)`** に変更した。PostgREST への HEAD が環境によって失敗し Vercel 上で 503 になる問題を避ける。

## [1.30.4] - 2026-04-13

### Fixed

- **監視**: `/api/health` の `diagnostic` が `message=` のみになるケースに対し、プレーンオブジェクトの `status` / `statusCode` / `error` を拾い、空文字の `message` は列挙から除外する。JSON フォールバックで構造を短く返す。

## [1.30.3] - 2026-04-13

### Fixed

- **監視**: `/api/health` の `diagnostic` が `unknown_error` になるケースを減らすため、`Error` サブクラス（`PostgrestError` 等）を優先して `message` / `code` / `details` / `hint` / `cause` を抽出するようにした。

## [1.30.2] - 2026-04-13

### Fixed

- **監視**: `/api/health` が `503` のとき PostgREST 由来の `diagnostic`（`code` / `message`）を返し、Supabase 側の失敗理由を切り分けしやすくした。Vercel サーバーレス向けに Sentry 送信後に `flush` するようにした。`head` クエリから冗長な `.limit(1)` を外した。

## [1.30.1] - 2026-04-13

### Fixed

- **監視**: 認証用 `proxy` ミドルウェアが `/api/health` を `/login` へリダイレクトしていたため、外形監視で 307 になる問題を修正した。`/api/health` は未ログインでも Route Handler まで到達する。

## [1.30.0] - 2026-04-13

### Added

- **監視**: `GET /api/health` を追加し、アプリ生存と Supabase 疎通（`shared_products` への軽量クエリ）を返すようにした。異常時は `503` を返し、Sentry にエラー送信する（[#170](https://github.com/kzkski/ketolog/issues/170)）。

## [1.29.8] - 2026-04-13

### Fixed

- **監視（Sentry）**: Vercel 上で `NEXT_PUBLIC_SENTRY_RELEASE` を手入力しなくても、ビルド時の `VERCEL_GIT_COMMIT_SHA` がクライアント向け `release` に反映されるようにした。環境変数 UI に `$VERCEL_GIT_COMMIT_SHA` と入力しても展開されない点との齟齬を避ける。

## [1.29.7] - 2026-04-13

### Fixed

- **今日（/today）**: メニュー編集ドロワーのグループ名「候補」ボタンをモバイルでタップしたとき、入力欄へフォーカスが移ってソフトウェアキーボードが起動する挙動を抑制した。キーボード操作時の候補表示は従来どおり維持（[#164](https://github.com/kzkski/ketolog/issues/164)）。

## [1.29.6] - 2026-04-13

### Fixed

- **今日（/today）**: メニュー編集ドロワーのメモ欄を複数行 `textarea` に変更し、入力に合わせて自動拡張するようにした。長文でも見通しよく編集でき、一定行数を超えると内部スクロールへ切り替わる。
- **今日（/today）**: グループ名入力に候補表示の常時トリガー（「候補」ボタン）を追加し、既存グループ候補の存在に気づきやすくした。自由入力は従来どおり維持（[#162](https://github.com/kzkski/ketolog/issues/162)）。

## [1.29.5] - 2026-04-13

### Fixed

- **今日（/today）**: お店が 0 件でも「文科省表2023」タブを開いて食品成分の検索結果を閲覧できるようにした。追加先がない場合は追加操作のみ無効のまま、画面内で案内を表示するようにした（[#160](https://github.com/kzkski/ketolog/issues/160)）。
- **初期シード**: 新規ユーザー作成時に既存プリセットを全件インストールするようにし、不要になった「ホルモン焼肉天龍高円寺」プリセットを同梱対象から削除した（[#160](https://github.com/kzkski/ketolog/issues/160)）。

## [1.29.4] - 2026-04-13

### Fixed

- **今日（/today）**: お店タブの並べ替え（`@dnd-kit`）を `SortableRestaurantTabs.tsx` に切り出し、チャンクを遅延読み込みするまでドラッグ不可の通常タブ（`RestaurantTabsStatic`）を表示するようにした。初回バンドルから dnd-kit の大半を外す（[#145](https://github.com/kzkski/ketolog/issues/145) Phase 4）。

## [1.29.3] - 2026-04-13

### Fixed

- **今日（/today）**: バーコード用の ZXing（`@zxing/browser` / `@zxing/library`）を静的 import せず、ネイティブ `BarcodeDetector` が使えない環境でカメラを起動したときだけ dynamic import するようにした。初回 JS の読み込み量を抑える（[#145](https://github.com/kzkski/ketolog/issues/145) Phase 3）。

## [1.29.2] - 2026-04-13

### Fixed

- **今日（/today）**: デスクトップでカートを `useEffect` + `requestAnimationFrame` のあとから開いていたためレイアウトがずれていたのを、`useLayoutEffect` で初回ペイント前に開くように変えた（[#145](https://github.com/kzkski/ketolog/issues/145) Phase 2）。
- **今日（/today）**: サーバーでデータ取得中は `loading.tsx` のスケルトンを表示するようにした（[#145](https://github.com/kzkski/ketolog/issues/145) Phase 2）。

## [1.29.1] - 2026-04-13

### Fixed

- **今日（/today）**: サーバー側の初回表示を速くするため、同一リクエスト内の `getUser` を `react` の `cache` で 1 回にまとめ、初回データ取得とスナップショット用レストラン取得を並列化し、`public/presets` の一覧読み込みをプロセス内キャッシュした（[#145](https://github.com/kzkski/ketolog/issues/145) Phase 1）。

## [1.29.0] - 2026-04-13

### Added

- **今日**: お気に入り（☆）が1件以上あるときは、開いたときのデフォルトタブを「お気に入り」にした（[#142](https://github.com/kzkski/ketolog/issues/142)）。

## [1.28.1] - 2026-04-12

### Fixed

- **ログイン・新規登録**: 画面上部のアイコンが表示されない場合がある問題を修正した。ロゴは `next/image` の最適化を経由せず `public` の PNG をそのまま参照し、認証用 `proxy` をミドルウェア化した際も `/icons/`・PWA 用 `sw.js`・`manifest.webmanifest` が未ログインで `/login` に飛ばされないようにした（[#134](https://github.com/kzkski/ketolog/issues/134)）。

## [1.28.2] - 2026-04-12

### Fixed

- **設定**: PFC 目標セットの数値入力で、一時的に桁を消したり空欄にしたりできるようにした。フォーカスが外れるか保存すると、空・不正な値は直前の確定値に戻り、有効な値は 1g 以上の整数に正規化される。

## [Unreleased]

### Added

- **開発者向け**: Sentry 発報時の一次切り分けと月次棚卸しを [docs/release/sentry-operations-runbook.md](docs/release/sentry-operations-runbook.md) にまとめた。
- **ドキュメント**: 市場調査レポートを [docs/research/README.md](docs/research/README.md) に集約し、README・ROADMAP・リリース文書から動線を張った。
- **開発者向け**: ベータ開放・一般公開に向けたチェックリストと運用メモを [docs/release/README.md](docs/release/README.md) 以下に追加した。

### Changed

- **ドキュメント**: 市場調査の方針要約を [ROADMAP.md](ROADMAP.md)、[docs/research/README.md](docs/research/README.md)、ベータ／GA チェックリスト（[docs/release/beta-checklist.md](docs/release/beta-checklist.md)、[docs/release/general-availability-checklist.md](docs/release/general-availability-checklist.md)）に反映した（[#139](https://github.com/kzkski/ketolog/issues/139)）。
- **設定・ドキュメント**: PFC プリセットを **導入期（100/150/20）** / **脂肪燃焼期（100/120/40）** / **TKD（110/110/60）** に変更した。README・DB 既定を整合し、未カスタムの従来既定 JSON に一致する行のみマイグレーションで更新する。
- **設定**: PFC 目標の「表示」と「編集」を同じ3チップにまとめ、フェーズ番号の二重操作をやめた。
- **設定**: PFC 目標セットを、セットごとに1行ずつ（名前＋P/F/C）並べて編集できるようにした。
- **設定**: 目標セットの名前はチップの長押し／右クリックから「名前を変更」するようにし、常時表示のテキストボックスをやめた（お店タブと同様の操作）。

## [1.28.0] - 2026-04-12

### Added

- **今日・設定**: ダイエットフェーズ（1〜3）ごとに PFC 目標と名称を保存し、**表示中のフェーズ**に合わせて上部の PFC バー・ヘッダーヒント・メニュー行のハイライトが変わるようにした。今日ページの日付行の下からフェーズを切り替えられる。設定ドロワーで各フェーズの名称・目標を編集できる（[#132](https://github.com/kzkski/ketolog/issues/132)）。
- **プリセット**: ステーキチェーン公式栄養表に基づく外食プリセット **`external-steak-keto.json`** を追加した。取り込み後の店名は **ステーキ（汎用）**、**ステーキ（汎用）**プリセット: `group` を **品目名**（ワイルドステーキ等）に変更。450g 行の追加（外挿含む）、ワイルドコンボ3種・グリルチキン・乱切り全g、ヒレカットの拡充。ブレードミート・丼類は除外。付け合わせ野菜の差し引き方針は従来どおり（[#11](https://github.com/kzkski/ketolog/issues/11)）。
- **今日**: お店タブの店名を、長押しまたは右クリックのメニューから変更できるようにした（お気に入りグループ名は条件付きで追従。スナップショット専用の店は変更不可）。

### Fixed

- **スナップショット**:「（スナップショット記録）」の `restaurants` 行がユーザーごとに増殖しうる不具合を修正した。既存の重複はマイグレーションで1件に統合し、DB 上はユーザーあたり1件のみとした（[#120](https://github.com/kzkski/ketolog/issues/120)）。

### Changed

- **開発者向け**: Pull Request で `package.json` の `version` を変えたとき、`CHANGELOG.md` に同じ版の見出し（`## [X.Y.Z]`）があることを GitHub Actions で検証するようにした（[#126](https://github.com/kzkski/ketolog/issues/126)）。
- **プリセット**: ケンタッキー（オリジナルチキン）プリセットの既定グラムを可食部の実測目安に合わせた（キール・サイ・リブ）。ウイング・ドラムはグラム据え置きで注記を実測目安・個体差に沿って整理した（[#124](https://github.com/kzkski/ketolog/issues/124)）。
- **設定**: 全データエクスポートの件数説明を、メニュータブ等の登録件数であることが分かる文言にした。
- **設定**: 全データ JSON ダウンロードから内部用の「（スナップショット記録）」お店と、その店に紐づくメニューを除外し、件数表示もエクスポート内容と一致させた。

## [1.27.0] - 2026-04-12

### Added

- **設定**: 「全データをJSONでダウンロード」に、登録済みの食事ログ（全期間）を含めた。エクスポート形式は `version` 2（`foodLog` 配列を追加）。件数が多い場合もページング取得で欠けないようにした（[#130](https://github.com/kzkski/ketolog/issues/130)）。

## [1.24.0] - 2026-04-12

### Added

- **プリセット**: 外食向けの汎用プリセットを追加した（焼肉・焼き鳥／焼きとん・居酒屋）。「プリセットから選ぶ」に表示される。

## [1.23.1] - 2026-04-12

### Fixed

- **プリセット**: コンビニ統合プリセットの一覧・取り込み後の店名を **「コンビニ」** にした（ファイル名 `convenience-keto.json` は変更なし）。

## [1.23.0] - 2026-04-12

### Changed

- **プリセット**: コンビニ統合プリセットのファイル名を `convenience-keto.json`、店名を `convenience` に変更した（旧 `conbini-keto.json`／`conbini`）。

## [1.22.0] - 2026-04-12

### Changed

- **プリセット**: セブンイレブン・ファミリーマート・ローソンの各 JSON を廃止し、1 ファイル `conbini-keto.json`（店名 `conbini`）に統合した。チェーン別表示はメニューの `group`（セブンイレブン／ファミリーマート／ローソン）で行う。

## [1.21.0] - 2026-04-12

### Changed

- **今日ページ**: 名前付きメニューグループが複数ある店（およびお気に入りの複数グループ）では、初期表示でグループを閉じた状態にした。開いたグループはブラウザに記憶し、次回同じタブで復元する。

### Fixed

- **今日ページ**: 開閉状態を保存したあとリロードすると、メニューグループの表示でハイドレーションエラーになる問題を修正した。

## [1.20.0] - 2026-04-12

### Added

- **今日ページ**: ヘッダー中央のヒントをタップすると、省略されていた全文をシートで表示できるようにした。

## [1.19.3] - 2026-04-12

### Changed

- **今日ページ**: 「この日の記録」一覧の行間・行の余白をさらに詰め、展開時のスクロール領域の高さを少し広げた（`max-h-52` → `max-h-60`）。

## [1.19.2] - 2026-04-12

### Changed

- **今日ページ**: 「この日の記録」折りたたみ内のログ行・食事区分見出し・トグル行を、モバイルでメニュー一覧と同系統のフォントサイズ・行間・余白に揃えた。

## [1.19.1] - 2026-04-12

### Changed

- **初回表示**: 1.19.0 で追加したインライン SVG ブートオーバーレイと `html`/`body` のインライン背景指定を撤回した（サーバー応答前の白画面は置き換えられず、マークは一瞬しか見えないため）。

## [1.18.1] - 2026-04-12

### Fixed

- **iOS PWA**: ホームインジケーター付近に白い帯が出ることがあったのを、`html`/`body` の背景と `100dvh` ベースの高さで解消。

## [1.18.0] - 2026-04-12

### Added

- **PWA**: Web App Manifest（ホーム画面追加・スタンドアロン表示）、テーマ色・iOS 向けメタ、本番のみ有効な Service Worker（`/_next/static/` と `/icons/` の GET のみキャッシュ。HTML・API はキャッシュしない）。

## [1.17.1] - 2026-04-12

### Changed

- **今日ページヘッダー**: ロゴ用に `icon-header.png`（160×160、512 マスターから縮小）を追加し、表示サイズを大きくして小さい画面でも潰れにくくした。

## [1.17.0] - 2026-04-12

### Added

- **ヘッダー・ログイン・新規登録**: Ketolog ロゴ（アプリアイコン）を表示。PWA 用の 192×192 / 512×512 PNG を `public/icons/` に追加。

## [1.16.7] - 2026-04-12

### Changed

- **今日ページ・成分表**: 登録先お店のセレクトを、末尾の「に追加する」と同一行にまとめた（ラベルはスクリーンリーダー用に非表示）。

## [1.16.6] - 2026-04-12

### Changed

- **今日ページ・成分表**: 食品群（18群）のチップボタンを行間・余白ともに圧縮した。

## [1.16.5] - 2026-04-12

### Changed

- **今日ページ**: お気に入り・成分表・レストラン名のタブ行で、`sm` 未満のフォントを小さくした（`sm` 以上は従来どおり）。

## [1.16.4] - 2026-04-12

### Changed

- **今日ページ・メニュー一覧**: レストラン（およびお気に入り）のメニュー行で、`sm` 未満の品名を `text-xs`、副行・g 表示を一段小さくし、行の余白も抑えた（`sm` 以上は従来に近いサイズ）。

## [1.16.3] - 2026-04-12

### Changed

- **今日ページ（モバイル）**: タイトルバー・PFC・食事／店タブ・一覧グループ見出しなどの余白とタッチ行の高さを抑え、狭い画面で一覧が多く見えるようにした。
- **今日ページ（モバイル）**: 日付ナビをさらにコンパクト化（縦余白・矢印サイズ・日付フォント）。過去日の「今日に戻る」は日付と同一行（`sm` 以上は縦並び）。
- **今日ページ・メニュー一覧**: レストランのメニュー行のフォントと余白をモバイル中心に一段小さくした。

## [1.16.0] - 2026-04-12

### Added

- **今日ページ**: レストランタブに「文科省表2023」を追加。日本食品標準成分表（八訂）増補2023のマスタを検索し、メニュー追加ドロワーに PFC を流し込める。`menu_items.standard_food_code` で食品番号を保持。データ投入・スキーマはマイグレーションと `npm run etl:mext-ch2`（[#3](https://github.com/kzkski/ketolog/issues/3)）。

### Changed

- **今日ページ・文科省表**: 検索結果が多いとき **前へ / 次へ** で40件ずつページ送り（一覧の上下に操作）。`search_standard_foods` に `p_offset`（マイグレーション `20260412130000`）。
- 名称検索のプレースホルダーをマスタ表記に合う例（「ささみ、木綿豆腐」）に変更（「鶏むね」のような連続表記はデータに無くヒットしない場合がある）。

## [1.15.2] - 2026-04-12

### Fixed

- **メニュー一覧**: 詳細で保存した 1 食あたりの重量（g）が、一覧右端の表示にすぐ反映されるよう修正（[#78](https://github.com/kzkski/ketolog/issues/78)）。

## [1.15.1] - 2026-04-12

### Fixed

- **今日ページヘッダー**: ヒントが PFC バー（確定摂取＋カート）と同期するよう改善。スロット内の `localStorage` 固定をやめ、文面は約 300ms デバウンスで更新（[#79](https://github.com/kzkski/ketolog/issues/79)）。

## [1.15.0] - 2026-04-12

### Added

- **プリセット**: ケンタッキーフライドチキン（オリジナルチキン部位：キール・サイ・ドラム・ウイング・リブ）を `public/presets/kfc-original-chicken.json` として同梱（[#76](https://github.com/kzkski/ketolog/issues/76)）。

### Changed

- **開発者向け**: アプリ未使用の `body_composition` / `daily_log` / `daily_summary` をベースラインから削除（[#74](https://github.com/kzkski/ketolog/issues/74)）。ベースラインの内容を変更したため、ローカルでチェックサム不一致になる場合は `supabase db reset` するか、[migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) を参照。

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
