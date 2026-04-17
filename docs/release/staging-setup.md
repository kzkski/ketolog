# ステージング環境の準備（Supabase + Vercel Preview）

本番とは別の Supabase プロジェクトにマイグレーションを当て、**Vercel の Preview デプロイがそのステージング DB を向く**ようにする手順の正本。ベータ前のリハーサル、OAuth を含む動作確認、本番マイグレーション前の検証に使う。

関連: [operations-and-costs.md](operations-and-costs.md)（無料枠2プロジェクト）、[beta-checklist.md](beta-checklist.md)（登録・認証）、[quality-and-ci.md](quality-and-ci.md)（テスト用 DB）。マイグレーション履歴の整理は [#72](https://github.com/kzkski/ketolog/issues/72)。

## 目的

- **`main` にマージする前**に、リポジトリの `supabase/migrations/` を**本番に近い環境**へ適用し、アプリと RLS を確認する。
- Vercel の **Preview を再度有効化**し、**プレビュー URL が変わっても OAuth が通る**ようにする（Supabase の Redirect URL ワイルドカード）。
- 本番の [`prod-db-migrate.yml`](../../.github/workflows/prod-db-migrate.yml) の運用（`main` マージ後の本番 `db push`）は維持する。

## 前提

- Supabase の**無料枠はオーケあたりプロジェクト数に上限がある**（目安は2。詳細は [operations-and-costs.md](operations-and-costs.md) と[公式の Billing](https://supabase.com/docs/guides/platform/billing-on-supabase)）。
- **本番用とステージング用でプロジェクトを分ける**と、無料2枠をほぼ使い切る。E2E 専用の3つ目が必要になったら別オーガまたは有料の判断が出る（[quality-and-ci.md](quality-and-ci.md)）。

## 手順 1: ステージング用 Supabase プロジェクト

1. Supabase で新規プロジェクトを作成（例: `ketolog-staging`）。リージョンは本番に合わせると差分が減る。
2. ローカルからリンクし、マイグレーションを適用する。
   - `npx supabase login`
   - `npx supabase link --project-ref <staging の Project ref>`
   - `npx supabase db push`（リポジトリの [`supabase/migrations/`](../../supabase/migrations/) が正本）
3. **Auth（URL Configuration）**（ステージングダッシュボード）
   - **Site URL**: 運用方針に合わせて設定する（固定の staging ドメインを使うならその URL。プレビューのみなら本番 URL でもよいが、メールテンプレの挙動は [Supabase の案内](https://supabase.com/docs/guides/auth/redirect-urls)に従い確認する）。
   - **Redirect URLs** に少なくとも次を追加する。
     - `http://localhost:3000/**`（ローカル）
     - **`https://*-.vercel.app/**`**（Vercel Preview 用。公式: [Redirect URLs — Vercel preview URLs](https://supabase.com/docs/guides/auth/redirect-urls)）
     - カスタムドメインの Preview を使う場合は、そのオリジンも明示的に追加する。
4. **Google OAuth 等を使う場合**
   - Google Cloud の OAuth クライアントに、**ステージング Supabase** の `https://<staging-ref>.supabase.co/auth/v1/callback` を**本番用コールバックとは別に**承認済みリダイレクト URI として追加する（プロジェクト ref が異なるため）。
5. ステージングの **`NEXT_PUBLIC_SUPABASE_URL`** と **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** を控える（Vercel の Preview 環境変数に使う）。

## 手順 2: Vercel（Preview をステージング DB に向ける）

1. プロジェクト設定で **デプロイプレビュー（Preview）を有効化**する（無効化している場合）。
2. **Settings → Environment Variables** で、**Preview** 環境にのみ次を設定する。
   - `NEXT_PUBLIC_SUPABASE_URL` … ステージングの URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` … ステージングの anon key
3. **Production** 環境の同一名は**本番 Supabase のまま**にし、誤って Preview と共有しない。
4. OAuth の `redirectTo` は、本番では `NEXT_PUBLIC_SITE_URL`、Preview では Vercel が注入する `VERCEL_URL` を使うなど、[Supabase の `getURL()` 例](https://supabase.com/docs/guides/auth/redirect-urls)に沿って組み立てる（コード変更が必要な場合は実装 Issue で追う）。

## 手順 3: 動作確認（最小チェックリスト）

- [ ] 任意の PR の Preview URL で、メールまたは Google のログインが最後まで通る。
- [ ] 本番 URL のデプロイが、引き続き本番 Supabase を向いている。
- [ ] ステージングに本番の個人データを入れない（必要なら匿名化した少量のみ）。

## 手順 4: GitHub Actions（任意・次の実装）

本番の [`prod-db-migrate.yml`](../../.github/workflows/prod-db-migrate.yml) に対し、**ステージング専用**のワークフローを追加する案。

- **トリガー**: `workflow_dispatch` を必須にし、必要なら `pull_request`（paths: `supabase/migrations/**`）はノイズとコストを見てから。
- **Secrets 例**: `STAGING_SUPABASE_PROJECT_REF`、`SUPABASE_ACCESS_TOKEN`（本番と共用可）、必要なら `STAGING_DATABASE_URL`（バックアップを取る場合）。
- **手順**: checkout → setup-cli → `supabase link`（staging ref）→ `supabase db push`（本番 workflow と同型）。

運用ルールの例: **ステージングで `db push` 成功と Preview で smoke を確認してから `main` にマージする**。

## 未決定事項（ドキュメントに残す）

次は Issue または運用メモで決める。

- **プレビューごとに staging に自動 `db push` するか**、**マージ直前に手動だけか**。
- **`*.vercel.app` を Redirect に含める広さ**と、**固定 staging ブランチ＋カスタムドメインだけに絞るか**のトレードオフ。
- **ベータ参加者向けの許可リスト＋招待コード**（[beta-checklist.md](beta-checklist.md) セクション1）の実装と、ステージング上での検証の順序。

## Tracking（実装・インフラ作業）

- **Tracking Issue**: [#250](https://github.com/kzkski/ketolog/issues/250)（インフラ・Vercel・Supabase ダッシュボード・任意 GHA）
- ベータゲート全体は [beta-checklist.md](beta-checklist.md)。アクセス制御 [#251](https://github.com/kzkski/ketolog/issues/251)、認証・法務 [#252](https://github.com/kzkski/ketolog/issues/252)、CI 強化 [#253](https://github.com/kzkski/ketolog/issues/253)、OFF 棚卸し [#255](https://github.com/kzkski/ketolog/issues/255)。
