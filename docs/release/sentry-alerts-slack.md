# Sentry アラート最小セットと Slack 通知（P1 / P2）

**目的**: 無料プラン前提で通知ノイズを抑えつつ、重大障害だけを Slack に上げる。実際のルールは **Sentry 上で作成**し、本書は **正本の仕様と操作手順**とする。

**関連**: ヘルス定期実行は [`.github/workflows/production-health-check.yml`](../../.github/workflows/production-health-check.yml)。一次切り分けの全体は Issue #169（Runbook）想定。

用語や UI ラベルが変わる場合は [Create Alerts](https://docs.sentry.io/product/alerts/create-alerts.md) と [Issue Alert Configuration](https://docs.sentry.io/product/alerts/create-alerts/issue-alert-config.md) を優先して読み替える。

---

## 1. 深刻度の定義（P1 / P2）

| 区分 | 意味 | 対応の目安 |
|------|------|------------|
| **P1** | 本番のコアが止まる、またはデータ欠損・セキュリティに直結しうる | 即時確認（可能なら 30 分以内に一次切り分け） |
| **P2** | 一部ユーザー・周辺機能、または性能劣化。単発ノイズの可能性あり | 営業時間内の初動でよい（連続発火時は P1 に昇格を検討） |

---

## 2. Slack 連携「済み」の確認（このあと手順に進む前）

次ができていることを確認する（まだなら [Slack の統合（公式）](https://docs.sentry.io/product/integrations/notification-incidents/slack/) を参照）。

| # | 確認内容 |
|---|----------|
| 1 | Sentry 左上の Organization が **本番イベントが入っている Org** になっている。 |
| 2 | **Settings**（歯車）→ **Integrations** → **Slack** で、状態が **Enabled**（インストール済み）。 |
| 3 | 通知したい Slack の **チャンネル**が Sentry から選べる（必要ならチャンネルで `/sentry link` や公式手順どおりに連携）。 |

ここまでできていれば、以降は **アラートルール側で「Slack に送る」アクションを足すだけ**でよい。

---

## 3. Issue アラートを 1 本作る共通手順（Slack へ通知）

Sentry の Issue アラートは **「いつ（WHEN）」「追加条件（IF）」「何をする（THEN）」**の三段で動く。

### 3.1 画面の開き方

1. ブラウザで [sentry.io](https://sentry.io) にログインする。
2. **Ketolog のイベントが入っている Organization** を選ぶ。
3. 左サイドバー（または上部メニュー）から **Alerts** を開く。
4. **Create Alert** または **Create Alert Rule** を押す。
5. 種類の選択で **Issues**（「Issue を監視する」系の項目）を選び、**Continue** / **Set Conditions** など次画面へ進む。

### 3.2 画面上で必ず触る項目（上から順）

| ブロック | 設定内容 |
|----------|----------|
| **Environment** | プルダウンで **`production`** のみ（開発・プレビューを混ぜない）。複数選べる UI なら本番だけに限定。 |
| **Project** | **ketolog**（実際のプロジェクト名に合わせる）。 |
| **WHEN（トリガー）** | 後述の「§5 ルール別」の表どおりに 1 つ選ぶ。例: *A new issue is created*、*The issue is seen more than … times in … minutes* など。 |
| **IF（フィルタ）** | ルールによって **追加**。例: *The event's tag `route` … equals `/api/health`*。行は **Add optional filter** 等で増やせる。 |
| **THEN（アクション）** | **Add action** → **Send a Slack notification**（または **Send a notification via an integration** の中の Slack）を選ぶ。 |
| **Slack 先** | ドロップダウンで **ワークスペース**と **チャンネル**（例: `#incidents`）を指定。 |
| **アクション間隔（レート制限）** | **Perform these actions at most once every …** で **30 minutes** などを選ぶ（§5 の「抑制」列に合わせる）。公式では [Action Interval](https://docs.sentry.io/product/alerts/create-alerts/issue-alert-config.md#action-interval-rate-limit) と呼ばれる。 |
| **名前** | わかる名前（例: `[P1] Health route 連続失敗`）。 |

### 3.3 テスト通知（ルール保存前後）

- 画面に **Send Test Notification**（通知テスト）があれば、**THEN** で Slack を選んだ状態で実行し、**該当チャンネルに投稿される**ことを確認する。  
  公式: [Notification Tests](https://docs.sentry.io/product/alerts/create-alerts/issue-alert-config.md#notification-tests)
- 無い場合は、**保存後**に意図的に小さなテスト用エラーを 1 件送るか、既存の軽い Issue でルールが発火するかで確認する。

### 3.4 保存

- 画面下部の **Save Rule** / **Save** で保存する。
- **Alerts** の **Alert Rules** 一覧に名前が出ていれば作成済み。

---

## 4. Metric アラートを 1 本作る共通手順（Slack へ通知）

件数・パーセンタイルなど **数値の閾値**で見るときに使う（Issue アラートで表現しづらい「15 分で N 件」等）。

### 4.1 画面の開き方

1. **Alerts** → **Create Alert Rule**。
2. 種類で **Issues 以外**から選ぶ。例:
   - エラー件数: **Errors** / **Number of errors** 系
   - 遅延: **Performance** / **Latency** / **Transaction duration** 系  
   （表示名は Sentry のバージョンで異なる。迷ったら [Metric Alert Configuration](https://docs.sentry.io/product/alerts/create-alerts/metric-alert-config.md) の「Metrics Types」を参照。）
3. **Set Conditions** / **Continue** で設定ページへ。

### 4.2 設定の流れ

| 順 | 内容 |
|----|------|
| 1 | **Project** = ketolog、**Environment** = `production`。 |
| 2 | **Metric**（例: Number of errors）と **集計時間**（例: 15 minutes）を選ぶ。 |
| 3 | **Filter** 欄に Discover 風の条件を入れる（例: `url:*auth*` や `transaction:*login*`）。タグなら `route:/api/health` 等。 |
| 4 | **Threshold**（Critical / Warning）で「いつ赤にするか」を数値指定。 |
| 5 | **Actions** で **Send a Slack notification** を追加し、チャンネルを指定。 |
| 6 | **Rule name** を入力して保存（Metric は **Org 内で名前一意**の制約がある）。 |

無料プランでは Metric の種類や高度なフィルタに制限がある場合がある。そのときは Issue アラートに寄せる（§8）。

---

## 5. 最小 5 本 — ルール別の「画面での選び方」

`/api/health` の失敗時は [`src/app/api/health/route.ts`](../../src/app/api/health/route.ts) で `Sentry.captureException` され、タグ **`route` = `/api/health`**、**`check` = `supabase`** が付く。

以下の **WHEN / IF** は英語ラベルが画面そのままの場合と、日本語 UI の場合がある。**意味が同じ選択肢**を選ぶ。

### 5.1 新規の未処理エラー（P1）— Issue アラート

| 項目 | 画面での指定 |
|------|----------------|
| 種類 | **Issues** |
| Environment | `production` |
| **WHEN** | **A new issue is created**（新しい Issue が作られたとき） |
| **IF（推奨）** | **The event's** … **handled** / **error.handled** が **false** / **no** に相当する条件（「未処理エラー」のみ）。UI に無ければ Level が error 以上などで代用し、後で絞る。 |
| **THEN** | **Send a Slack notification** → チャンネル指定 |
| アクション間隔 | **30 minutes**（同一 Issue への連投抑制） |

### 5.2 ヘルスチェック連続失敗（P1）— Issue アラート

| 項目 | 画面での指定 |
|------|----------------|
| 種類 | **Issues** |
| Environment | `production` |
| **WHEN** | **The issue is seen more than `2` times in `10` minutes**（同一 Issue のイベントが 10 分で 2 回超）に相当するトリガー |
| **IF** | **The event's tag** `route` **equals** `/api/health`（なければ tag `check` **equals** `supabase`） |
| **THEN** | Slack |
| アクション間隔 | **10 minutes** 以上（連続失敗のたびに秒単位で飛ばないようにする） |

### 5.3 認証まわりのエラー急増（P2）— Metric アラート推奨

| 項目 | 画面での指定 |
|------|----------------|
| 種類 | **Errors** → **Number of errors**（件数） |
| Environment | `production` |
| 時間窓 | **15 minutes** |
| **Filter** | 次のいずれか／組み合わせ（イベントが取れているプロパティに合わせる）: `url:*auth/callback*` または `url:*login*` または `transaction:*auth*` |
| **Threshold** | 15 分間の件数 **> 20**（ベータのトラフィックで調整） |
| **Actions** | Slack |

Issue アラートだけで似たことをする場合は、WHEN に「◯ 分で △ 回」系を使い、IF で URL / transaction に `login` や `auth` を含む条件を足す。

### 5.4 API / サーバー応答の遅延悪化（P2）— Metric アラート

| 項目 | 画面での指定 |
|------|----------------|
| 種類 | **Performance** → **Transaction duration**（または Latency の p95） |
| Environment | `production` |
| 時間窓 | **5 minutes**（評価間隔は Sentry 側の仕様に従う） |
| **Filter** | `transaction.op:http.server` 等、サーバー側トランザクションに絞る（利用可能なら） |
| メトリック | **p95**（95 パーセンタイル） |
| **Threshold** | **Critical** 例: p95 **> 3000 ms**（実測で上下に調整） |
| **Actions** | Slack |

前提: [`sentry.server.config.ts`](../../sentry.server.config.ts) の `tracesSampleRate` が 0 より大きく、トランザクションが届いていること。

### 5.5 同一エラー（同一 Issue）の急増（P1）— Issue アラート

| 項目 | 画面での指定 |
|------|----------------|
| 種類 | **Issues** |
| Environment | `production` |
| **WHEN** | **The issue is seen more than `50` times in `1` hour** に相当 |
| **IF** | 特になし（全体対象）。ノイズが多ければ `production` のみ・特定 release などを後から足す。 |
| **THEN** | Slack（本文に Issue リンクが付く想定） |
| アクション間隔 | **30 minutes** 〜 **1 hour**（5.1 との二重通知を減らす） |

---

## 6. 通知スパム抑制（早見）

| 手段 | どこで設定するか |
|------|------------------|
| 同一 Issue への連続通知を減らす | Issue アラートの **Action interval**（§3.2） |
| 本番以外を除外 | ルールごとの **Environment** = `production` |
| 閾値の見直し | Metric の **Threshold**、Issue の **WHEN** の「◯ 分で △ 回」 |
| メールダイジェスト | Issue メール向け。**Slack 連携通知とは別**（[Digests](https://docs.sentry.io/product/alerts/create-alerts/issue-alert-config.md#digests)） |

---

## 7. 実装後のチェックリスト

- [ ] いずれかのルールの **THEN** で **Slack** を選び、**テスト通知**または軽い発火で **Slack に届いた**。
- [ ] §5 の **5 本**が Alert Rules 一覧に存在する。
- [ ] 各ルールの **Environment** が意図どおり（基本は `production` のみ）。
- [ ] **アクション間隔**が空欄のままになっていない（特に P1）。

---

## 8. 既知の制約

- Sentry の **プラン**によって、パーセント変化トリガーや高度な Transaction フィルタが使えないことがある。その場合は §5 の条件を粗くし、Issue アラート中心にする。
- 認証は **例外を投げずリダイレクトだけ**の経路がある。§5.3 の Filter は **実際に Sentry に届いているイベント**を Discover で一度確認してから固める。
- UI のラベルは英日で異なる。**WHEN = トリガー、IF = 追加条件、THEN = Slack** の対応さえ合っていればよい。
