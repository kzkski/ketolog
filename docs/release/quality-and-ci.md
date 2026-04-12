# CI・テスト・品質保証

## コードベースに対する「追加実装」の見積もり

機能面（ゲート緩和、法務ページ、アカウント削除など）は要件が明確で追いやすい一方、**品質基盤は現状ほぼ空**で、一般公開後のメンテで効いてくる。

| 領域 | 現状 | 追加で必要になりやすいこと | 工数感の目安 |
|------|------|---------------------------|-------------|
| **CI** | [`.github/workflows/pr-guardrails.yml`](../../.github/workflows/pr-guardrails.yml) は **PR タイトル規約・CHANGELOG のみ**。`npm run lint` / `npm run build` は **未実行** | **checkout → install → lint → build** を PR ごとに実行。Node キャッシュで高速化 | 小〜中 |
| **自動テスト** | [`package.json`](../../package.json) に **test スクリプトなし**。`*.test.*` / Playwright 設定も **未配置**（Next が `@playwright/test` を optional peer で参照するだけ） | ユニット（純関数・`diet-phase` 等）→ 結合 → E2E | 中〜大 |
| **E2E** | [Issue #59](https://github.com/kzkski/ketolog/issues/59) で認証・テスト DB・viewport が整理済み。リポジトリ内の **E2E 完結は未達に近い** | テスト専用サインイン or モック、**本番と別 Supabase**、最小スモーク（`/today`） | 大 |
| **手動検証** | [README.md](../../README.md) は実機・Playwright を「必要時に」 | **リリース前チェックリスト**（本ドキュメント末尾）で再現性を上げる | 小 |

**方針**: プロダクト機能と **CI・テストの足場**は別レイヤー。最低でも **CI に build（と lint）** はベータ前後で入れる価値が高い。E2E は [#59](https://github.com/kzkski/ketolog/issues/59) の通りコストが高いので **段階導入**（スモーク 1 本から）。

## GitHub イシュー参照サマリ

リポジトリのイシューを一覧したうえで、本テーマに効くもの。

| Issue | 内容との関係 |
|-------|----------------|
| [#59](https://github.com/kzkski/ketolog/issues/59) | E2E（Playwright）足場・認証・テスト DB。**品質保証の中核** |
| [#2](https://github.com/kzkski/ketolog/issues/2) | OFF・`shared_products`・キャッシュ。**負荷・悪用**の文脈 |
| [#72](https://github.com/kzkski/ketolog/issues/72) | Supabase マイグレーション／ベースライン。**環境複製・信頼性** |
| [#134](https://github.com/kzkski/ketolog/issues/134) | 認証・ミドルウェアと静的アセット。**ゲート変更時の退行**に注意 |

**課金しきい値専用のイシューは見当たらない** → [operations-and-costs.md](operations-and-costs.md) とダッシュボード実測で補う。

## 推奨レイヤー（下から順に積む）

### 1. PR ゲート（必須に近い）

`npm run lint` + `npm run build` on `pull_request`。コスト低・効果高。

### 2. ユニットテスト（任意だが有益）

`@/lib/diet-phase`、`macroHighlights`、バリデーション、OFF レスポンスのパースなど **純関数・副作用の薄い層**から。Server Actions 全体のモックは後回しでよい。

### 3. 結合テスト（中期）

DB を伴う処理は **ローカル `supabase start` + シード**、またはモックした Supabase クライアント。

### 4. E2E / Playwright（長期）

- **Google OAuth の対話**を CI で回さない設計（テスト用メールログイン、魔法リンク、開発限定バイパス、`storageState` 等）。
- **本番 DB への書き込み禁止**。テスト専用 Supabase または分離。
- **スコープ**: まず `/today` スモーク。**バーコード（カメラ）**は [#59](https://github.com/kzkski/ketolog/issues/59) の通り **手動チェックリスト**または別戦略。

### 5. リリース前チェックリスト（人間）

自動化が追いつかない間、毎リリース踏む手順を固定する（下記）。

## 現状のリスク（要約）

CI が **CHANGELOG とタイトルしか検証していない**ため、**型・ESLint・本番ビルド失敗**は **マージ後のデプロイまで気づけない**。テストが無いため **リグレッションは手動とユーザー報告**に依存しやすい。

メンテ時は「壊したくないパス」（認証、`/today` の食事記録、設定エクスポート）から **テストを逆算で載せる**と投資対効果が高い。

## リリース前チェックリスト（たたき台）

リリースや本番デプロイ前に、担当者が実施して記録する。

- [ ] `npm run lint` / `npm run build` がローカルで通る（CI 導入後は PR で自動）
- [ ] ログイン（メール／Google の両方、本番で有効な方）
- [ ] `/today` で食事記録の追加・編集・削除
- [ ] 設定から全データエクスポート（JSON）
- [ ] モバイル幅での主要画面（README の手順）
- [ ] バーコード: **実機**でスキャン（E2E 対象外のとき）
- [ ] PWA: 本番 HTTPS で manifest / SW（[README.md](../../README.md)）
