# Sentry 監視・発報 運用 Runbook

**目的**: Slack / GitHub Actions / 利用者からの連絡で「おかしい」と分かったときの **一次切り分け**と **月次メンテ**を手順化し、属人化を防ぐ。

**前提ドキュメント**

- アラート 5 本の定義・Slack 設定: [sentry-alerts-slack.md](sentry-alerts-slack.md)
- 本番ヘルスの定期 GET: [`.github/workflows/production-health-check.yml`](../../.github/workflows/production-health-check.yml)
- `/api/health` の挙動: [beta-checklist.md](beta-checklist.md) §4

---

## 1. 発報の入口

| 入口 | まず開く場所 |
|------|----------------|
| Slack（Sentry 通知） | メッセージ内の **Issue / Alert へのリンク** |
| GitHub Actions が赤 | リポジトリ **Actions** → **Production health check** → 失敗した実行のログ |
| 利用者からの報告 | 再現手順・時刻・ブラウザをメモしてから Sentry で同一時間帯を検索 |

**記録する項目**（インシデントメモにそのまま貼れるようにする）

- 日時（UTC か JST かを明記）
- 通知元（Slack のルール名 / GitHub job / 口頭）
- 影響範囲（全ユーザー / 一部 / 未確認）
- 参照 URL（Sentry issue、Vercel deployment、Supabase の画面名）

---

## 2. 一次切り分け（標準順: Sentry → Vercel → Supabase）

**目安時間: 15 分**。この範囲で「アプリか / 基盤か」を切る。

### ステップ A — Sentry（1〜5 分）

1. Issue または Metric アラートの詳細を開く。
2. 次を確認する。
   - **environment** が `production` か
   - **初回発生時刻**と **イベント数**（単発か継続か）
   - **release**（デプロイ直後か）
   - タグ **`route`** / **`check`**（`/api/health` 由来なら DB 疎通系の可能性）
3. **Stack trace** と **Breadcrumbs** で、クライアントかサーバーかを判別する。

**ここで分かったら**

- 特定ユーザーのみ・特定 URL のみ → アプリ不具合やデータ不整合の疑い。Issue を **担当者にアサイン**し、再現手順を追記。
- `route:/api/health` かつ PostgREST 系メッセージ → **ステップ C（Supabase）を優先**してもよい。

### ステップ B — Vercel（3〜7 分）

1. [Vercel](https://vercel.com) で対象プロジェクトを開く。
2. **Deployments**: 障害時刻前後に **本番（Production）** のデプロイがないか。
3. 該当デプロイの **Runtime Logs**（Functions）で、同時刻付近の **5xx** やタイムアウトがないか。
4. **環境変数**は一覧だけ確認し、**値は開かない**（欠落の有無・最近の変更の有無）。

**ここで分かったら**

- デプロイ直後に急増 → **ロールバックまたはホットフィックス**を検討。
- ログに関数タイムアウト・メモリ → 負荷または外部 API 遅延の疑い → Supabase / 外部と併せて見る。

### ステップ C — Supabase（3〜7 分）

1. [Supabase Dashboard](https://supabase.com/dashboard) で対象プロジェクトを開く。
2. **Project Settings → Database** 周辺でメンテナンス表示がないか（公式ステータスも参照）。
3. **Logs**（API / Postgres）で、障害時刻付近の **エラー・スロークエリ**がないか。
4. `/api/health` が 503 のときは、Issue の **diagnostic**（`code` / `message`）と突き合わせる。

**ここで分かったら**

- PostgREST / 接続エラー → DB 側・ネットワーク・キー設定を疑う。必要なら **Supabase のサポート情報**を集める。
- RLS や権限エラー → アプリのクエリとポリシーを開発側で追う。

### ステップ D — GitHub Actions（ヘルス専用）

1. **Actions** → **Production health check**。
2. 失敗実行のログで **`curl` の終了理由**（タイムアウト / HTTP 503 等）を確認する。
3. 同時刻の Sentry に **`route:/api/health`** が無い場合、**Sentry 取り込み遅延**や **別経路の障害**も考慮する。

---

## 3. アラート名別の追加観点

[sentry-alerts-slack.md](sentry-alerts-slack.md) §5 のルール名に対応する。

| ルール名（目安） | 追加で見る場所 |
|------------------|----------------|
| `[P1] New issue (prod)` | 新規スタックの **初回コミット / リリース**。Regression ならデプロイ差分。 |
| `[P1] Health route 連続失敗 (15m/2x)` | **Supabase** と **Vercel 関数ログ**。GitHub **Production health check** の失敗時刻と突合。 |
| `[P2] Auth error 増加 (15m)` | **Auth ログ**（Supabase）、**`/auth/callback`**・**`/login`** 周りのデプロイ変更。 |
| `[P2] API latency p95 悪化` | **Vercel** の遅い関数、**DB** のスロークエリ。`tracesSampleRate` は低いため「見えない」こともある（§4）。 |
| `[P1] 同一Issue急増 (1h/50x)` | **無限ループ・リトライ・バッチ**の疑い。該当 Issue の **イベント一覧の間隔**を見る。 |

---

## 4. 無料枠・クォータを踏まえた運用ルール

コード上の既定（変更時は PR で理由を残す）:

- サーバー: [`sentry.server.config.ts`](../../sentry.server.config.ts) … `tracesSampleRate: 0.1`、`sampleRate: 1`
- クライアント: [`instrumentation-client.ts`](../../instrumentation-client.ts) … `tracesSampleRate: 0.1`、`ignoreErrors` でネットワーク系ノイズを除外

**運用でやらないこと（例）**

- トラフィック増でもないのに **`tracesSampleRate` を 1.0 に固定**する（取り込み・コスト増）
- **`ignoreErrors` を広げすぎて**本番の実障害を握りつぶす（ルール変更はレビュー必須）

**やること（例）**

- ノイズ Issue は **Archive** し、アラート条件（IF）で **再発火を防ぐ**
- パフォーマンスアラートが空振りする場合は **閾値**と**時間窓**を月次で見直す（§5）

---

## 5. 月次棚卸し（チェックリスト）

**頻度**: 月 1 回（目安 30 分）。担当はローテーション可。

- [ ] **Alert Rules** 一覧を開き、**Mute しっぱなし**・**不要ルール**がないか。
- [ ] 各ルールの **Environment** が `production` に限定されているか。
- [ ] **閾値**（件数・ms）が直近トラフィックに合っているか。誤報が多いルールは IF を追加。
- [ ] **Slack** のテスト通知が届くか（統合またはルールのテスト）。
- [ ] **GitHub** の `HEALTHCHECK_URL` が本番 URL のままか（リポジトリ **Settings → Secrets**）。
- [ ] [operations-and-costs.md](operations-and-costs.md) の「最終確認日」を更新するか判断（四半期でも可）。

---

## 6. エスカレーションの目安

- **P1**（[sentry-alerts-slack.md](sentry-alerts-slack.md) §1）: 一次切り分け後も原因不明、または本番利用不能 → 開発責任者へ共有し、必要ならデプロイ停止・ロールバックを判断。
- **P2**: 次営業日までにチケット化し、再発条件をメモ。

---

## 7. 関連リンク（公式）

- [Sentry Alerts](https://docs.sentry.io/product/alerts/)
- [Slack integration](https://docs.sentry.io/product/integrations/notification-incidents/slack/)
