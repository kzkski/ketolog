# Changelog

このプロジェクトの変更履歴です。

基本方針:
- `feat` / `fix` / `refactor` / `docs` の Pull Request では、原則 `CHANGELOG.md` を更新します（CIでチェック）。
- 詳細な背景や設計意図など長文は [ROADMAP.md](ROADMAP.md) に寄せ、ここにはユーザー視点の要点を短く残します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) を参考にしています。

## [Unreleased]

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
