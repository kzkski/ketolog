# リリース工学メモ（ベータ・一般公開）

機能の時系列・リリース履歴は [ROADMAP.md](../../ROADMAP.md) と [CHANGELOG.md](../../CHANGELOG.md) を正とする。ここでは **ベータ開放・一般公開に向けたゲート、法務、インフラコスト、CI/QA、第三者コンプライアンス** を扱う。

## どれから読むか

| 状況 | 読む順 |
|------|--------|
| **ベータを切りたい** | [beta-checklist.md](beta-checklist.md) → [quality-and-ci.md](quality-and-ci.md)（CI 最低ライン）→ [sentry-alerts-slack.md](sentry-alerts-slack.md)（アラート）→ [sentry-operations-runbook.md](sentry-operations-runbook.md)（発報時 Runbook）→ 必要なら [third-party-compliance.md](third-party-compliance.md) |
| **一般公開（GA）を切りたい** | [general-availability-checklist.md](general-availability-checklist.md) → [operations-and-costs.md](operations-and-costs.md) → [quality-and-ci.md](quality-and-ci.md) |
| **課金・枠の見直しだけ** | [operations-and-costs.md](operations-and-costs.md)（表の数値は公式を再確認すること） |
| **テスト・CI を整備する** | [quality-and-ci.md](quality-and-ci.md) |

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| [beta-checklist.md](beta-checklist.md) | 限定的ユーザー増：アクセス制御、認証設定、ベータ法務、運用、OFF 以外の横断。検証仮説の参考は §8（[docs/research/](../research/README.md) と連動） |
| [general-availability-checklist.md](general-availability-checklist.md) | GA：アカウント削除、濫用対策、本番法務、コミュニケーション |
| [operations-and-costs.md](operations-and-costs.md) | Vercel / Supabase の枠、課金検討の目安、信頼性 |
| [quality-and-ci.md](quality-and-ci.md) | CI 現状、lint/build、テストの段階、E2E（Issue #59）、リリース前確認 |
| [third-party-compliance.md](third-party-compliance.md) | Open Food Facts 等の継続義務・新規 API のテンプレ |
| [sentry-alerts-slack.md](sentry-alerts-slack.md) | Sentry の最小アラート 5 本・P1/P2・Slack 連携・通知抑制（運用者向け） |
| [sentry-operations-runbook.md](sentry-operations-runbook.md) | 発報時の一次切り分け（Sentry→Vercel→Supabase）、無料枠の注意、月次棚卸しチェックリスト |

## 関連（戦略・市場）

- [docs/research/README.md](../research/README.md) … 市場調査レポート（参考）。公開ゲート本体ではない。

## メンテナンス

- **更新頻度が高い**: `beta-checklist.md`（ゲート方式）、`quality-and-ci.md`（CI 変更時）。
- **四半期やトラフィック変化時**: `operations-and-costs.md`（文内の「最終確認日」を更新）。
- Cursor の計画ファイル（`.cursor/plans/` 等）は作業用。**確定した方針は本ディレクトリへ反映**し、リポジトリを正本とする。
