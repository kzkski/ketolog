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
| 2 | **Settings**（歯車）→ **Integrations** → **Slack** で **ワークスペースを追加（Add Workspace）** 済みで、連携が有効。 |
| 3 | 後述の **§2.1** のとおり、アラート作成画面の **Slack 通知先**で、使いたい **チャンネルが一覧に出る**（出ない場合は Slack 側で Sentry アプリをチャンネルに入れる）。 |

ここまでできていれば、以降は **アラートルール側で「Slack に送る」アクションを足すだけ**でよい。

### 2.1 「チャンネルが Sentry から選べる」とは何か

ここで言う **選べる** とは、次の画面のことです（§3 で詳述）。

1. Sentry で **Alerts** → **Create Alert Rule** → … と進み、**THEN（アクション）** で **Send a Slack notification** を選ぶ。
2. **Workspace**（Slack ワークスペース）と **Channel**（`#incidents` など）の **プルダウン**が表示される。
3. その **Channel** の一覧に、通知したいチャンネル名が **載っていて選べる**状態になっている。

**公開チャンネル**は、Org に Slack ワークスペースを繋いでいれば、多くの場合ここに出ます。

**プライベートチャンネル**や、一覧に出てこないときは、公式どおり **そのチャンネルに Sentry の Slack アプリ（ボット）を入れる**必要があります。例:

1. Slack で通知したいチャンネルを開く。
2. メッセージ入力欄で **`@Sentry`**（または `@sentry`）と入力し、表示された **Sentry アプリをチャンネルに招待**する。  
   または、チャンネル名を右クリック → **チャンネル設定** → **Integrations（連携）** タブで、**Apps** に **Sentry** が載っているか確認する（[公式 Troubleshooting](https://docs.sentry.io/product/integrations/notification-incidents/slack/#cant-add-alert-rule-to-channel)）。

### 2.2 `/sentry link` とは（アラートのチャンネル選択とは別）

混乱しやすいので切り分けます。

| コマンド / 操作 | 目的 | アラートのチャンネル一覧との関係 |
|-----------------|------|----------------------------------|
| **`/sentry link`**（Slack で実行） | **あなた個人**の Slack アカウントと Sentry アカウントを紐づけ、**個人向け通知**を Slack に送るため | **別**。チャンネルを増やす操作ではない。 |
| **`/sentry link team`** | **Sentry 上の Team** と、その Slack チャンネルを紐づけ、**チーム向け通知**に使う | チーム通知用。**Issue アラートで任意のチャンネルを選ぶ**場合とは別経路のこともある。 |
| **アラートルールの「Send a Slack notification」** | ルールごとに **Workspace + Channel を指定**して投稿する | ここで「選べる」チャンネルは、**主に Slack 側で Sentry アプリがそのチャンネルに入っているか**に依存。 |

まとめると、**インシデント用チャンネルに `@Sentry` を招待してから**、Sentry のアラート画面でその `#チャンネル` を選ぶ、という順が分かりやすいです。

---

## 3. 画面操作（迷わない最短手順）

本プロジェクトの実運用では、Sentry 画面の次ルートで作成する。

1. **アラート**画面の右上 **「アラートを作成」** を押す。
2. 左カラムで対象を選ぶ。
   - Issue ルール: `Errors > 課題`
   - Metric ルール: `Errors > Number of Errors` または `Performance > Duration`
3. **Set Conditions** に進む。
4. ルールを入力して保存する（後述の §5 をそのまま使う）。

### 3.1 全ルール共通（必須）

| 項目 | 値 |
|------|----|
| Environment | `production` |
| Project | `ketolog` |
| THEN | Slack 通知（workspace + channel） |
| Name | 必須 |
| Owner/Team | 必須 |

Issue ルールは **Set action interval** も必須で設定する。

### 3.2 テスト通知

- **Send Test Notification** がある場合は保存前に実行し、Slack 着弾を確認する。
- ない場合は保存後に軽いテストイベントで着弾確認する。

---

## 4. UI ラベル差分（英語表示との対応）

| 意味 | 表示されるラベル例 |
|------|--------------------|
| 同一 Issue の件数条件 | `Number of events in an issue is...` |
| タグ条件 | `The event's tags match {key} {match} {value}` |
| Issue アクション間隔 | `Set action interval` |
| Number of Errors の窓 | `15分 interval` / `15 minutes interval` |

---

## 5. 最小 5 本（この値で作る）

`/api/health` の失敗時は [`src/app/api/health/route.ts`](../../src/app/api/health/route.ts) で `Sentry.captureException` され、タグ **`route` = `/api/health`**、**`check` = `supabase`** が付く。

### 5.1 `[P1] New issue (prod)`（Issue）

- 入口: `Errors > 課題`
- WHEN: `A new issue is created`
- IF: なし
- Set action interval: `30 minutes`

### 5.2 `[P1] Health route 連続失敗 (15m/2x)`（Issue）

- 入口: `Errors > 課題`
- WHEN: `Number of events in an issue is more than 2 in 15 minutes`
- IF: `The event's tags match` で `route equals /api/health`
  - 代替: `check equals supabase`
- Set action interval: `10 minutes`（なければ `30 minutes`）

### 5.3 `[P2] Auth error 増加 (15m)`（Metric）

- 入口: `Errors > Number of Errors`
- Interval: `15 minutes`
- Filter 例: `is:unresolved (url:*auth/callback* OR url:*login* OR transaction:*auth*)`
- Threshold: Critical `Above 20`

### 5.4 `[P2] API latency p95 悪化`（Metric）

- 入口: `Performance > Duration`
- Function: `p95`
- Interval: `5 minutes`
- Threshold: Critical `Above 3000 ms`
- Filter 例（任意）: `transaction.op:http.server`

### 5.5 `[P1] 同一Issue急増 (1h/50x)`（Issue）

- 入口: `Errors > 課題`
- WHEN: `Number of events in an issue is more than 50 in one hour`
- IF: なし
- Set action interval: `30 minutes` 〜 `1 hour`

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
