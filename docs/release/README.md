# リリース工学メモ（v2 ベータ〜v3 一般公開）

機能の時系列・リリース履歴は [ROADMAP.md](../../ROADMAP.md) と [CHANGELOG.md](../../CHANGELOG.md) を正とする。ここでは **ベータ開放・一般公開に向けたゲート、法務、インフラコスト、CI/QA、第三者コンプライアンス** を扱う。

## このディレクトリの運用原則

- **ドキュメント = 設計・判断の正本**（何を/なぜ/どこまでやるか）
- **Issue = 実装実行の単位**（担当・受け入れ条件・完了管理）
- **PR = 実施記録**（`Closes #<子Issue>` と `Refs #<親Issue>` で追跡）
- まず本ディレクトリで方針を固め、次に Issue へ分解して着手する

## どれから読むか（v2/v3）

| 状況 | 読む順 |
|------|--------|
| **ベータを切りたい** | [beta-checklist.md](beta-checklist.md) → [quality-and-ci.md](quality-and-ci.md)（CI 最低ライン）→ [sentry-alerts-slack.md](sentry-alerts-slack.md)（アラート）→ [sentry-operations-runbook.md](sentry-operations-runbook.md)（発報時 Runbook）→ 必要なら [third-party-compliance.md](third-party-compliance.md) |
| **一般公開（GA）を切りたい** | [general-availability-checklist.md](general-availability-checklist.md) → [operations-and-costs.md](operations-and-costs.md) → [quality-and-ci.md](quality-and-ci.md) → [v3-native-feasibility.md](v3-native-feasibility.md)（事前検討） |
| **課金・枠の見直しだけ** | [operations-and-costs.md](operations-and-costs.md)（表の数値は公式を再確認すること） |
| **テスト・CI を整備する** | [quality-and-ci.md](quality-and-ci.md) |
| **v3 でネイティブ化検討を始めたい** | [v3-native-feasibility.md](v3-native-feasibility.md)（非ブロッキング） |

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| [beta-checklist.md](beta-checklist.md) | 限定的ユーザー増：アクセス制御、認証設定、ベータ法務、運用、Ketovisor 連携向けデータ契約。§9 は参考（非ブロッキング） |
| [general-availability-checklist.md](general-availability-checklist.md) | GA：アカウント削除、濫用対策、本番法務、コミュニケーション |
| [operations-and-costs.md](operations-and-costs.md) | Vercel / Supabase の枠、課金検討の目安、信頼性 |
| [quality-and-ci.md](quality-and-ci.md) | CI 現状、lint/build、テストの段階、E2E（Issue #59）、リリース前確認 |
| [v3-native-feasibility.md](v3-native-feasibility.md) | v3 一般公開時点のネイティブアプリ化検討メモ（判断材料の頭出し） |
| [third-party-compliance.md](third-party-compliance.md) | Open Food Facts 等の継続義務・新規 API のテンプレ |
| [sentry-alerts-slack.md](sentry-alerts-slack.md) | Sentry の最小アラート 5 本・P1/P2・Slack 連携・通知抑制（運用者向け） |
| [sentry-operations-runbook.md](sentry-operations-runbook.md) | 発報時の一次切り分け（Sentry→Vercel→Supabase）、無料枠の注意、月次棚卸しチェックリスト |

## 進捗トラッキングの最小フォーマット

`beta-checklist.md` と `quality-and-ci.md` の各実装セクション末尾に、以下を記載してから Issue 化する。

- `Status`: `Not started` / `In progress` / `Done`
- `Track`: `v2-1` / `v2-2` / `共通`
- `Tracking Issue`: 未作成時は `TBD`
- `Owner`: 任意（未定なら `TBD`）
- `DoD`: 完了判定を1-3行で定義

## 関連（戦略・市場）

- [docs/research/README.md](../research/README.md) … 市場調査の公開サマリー（参考）。公開ゲート本体ではない。

## メンテナンス

- **更新頻度が高い**: `beta-checklist.md`（ゲート方式）、`quality-and-ci.md`（CI 変更時）。
- **四半期やトラフィック変化時**: `operations-and-costs.md`（文内の「最終確認日」を更新）。
- Cursor の計画ファイル（`.cursor/plans/` 等）は作業用。**確定した方針は本ディレクトリへ反映**し、リポジトリを正本とする。
