# スケール・コスト・信頼性（Vercel / Supabase）

**最終確認日（手動で更新）**: ____-__-__（リリース前・四半期ごとに [Vercel Docs](https://vercel.com/docs/plans/hobby) と [Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase) を再確認すること）

## Supabase（Free プランの目安）

出典: [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) の表（変更されうる）。

| 項目 | Free の目安 |
|------|-------------|
| 無料プロジェクト数 | オーガあたり **2**（ポーズ中の扱いは公式に従う） |
| Egress | **5 GB / 月**（組織単位で合算） |
| Database Size | **500 MB / プロジェクト** |
| MAU（Auth） | **50,000**（小規模では **DB サイズ・Egress** が先に効くことが多い） |
| Storage | **1 GB**（本アプリはオブジェクトを大きく使わない前提なら余裕が出やすい） |

無料プランでは **非アクティブプロジェクトの一時停止**など、**常時本番 SLA として弱い**点がある。止まって困るなら **Pro 等への移行**が信頼性の軸になる。

### いつ課金（Pro 等）を検討するか（目安）

- **DB が 500 MB に近づく**（食事ログ・`shared_products`・文科省系テーブルの増加）。
- **Egress が 5 GB を超えそう**（頻繁な読み取り、大量エクスポート）。
- **ダウンタイム・ポーズを避けたい**、**PITR・長期バックアップ**、**サポート・ログ保持**を伸ばしたい。
- **ステージング + 本番 +（E2E 用など）**で無料の **2 プロジェクト**を超える → 別オーガナイゼーション分離か有料化の判断。

関連イシュー: [#72](https://github.com/kzkski/ketolog/issues/72)（マイグレーション／ベースライン・環境複製の文脈）。**本番 + ステージング**の2プロジェクト運用の手順は [staging-setup.md](staging-setup.md)（[#250](https://github.com/kzkski/ketolog/issues/250)）。

## Vercel（Hobby vs Pro）

出典: [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)、[Fair use – commercial usage](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)。

- **Hobby**: Fair use 上 **非商用・個人利用に限定**。**商用で一般公開する場合は Pro（または該当プラン）が前提**になりやすい（利用形態は Vercel の Terms に照合すること）。
- **Hobby に含まれる量の例**: Function **100 万回/月**、Function Duration **100 GB-Hours**、Active CPU **4 CPU-hrs** など。転送量は [Limits](https://vercel.com/docs/limits) で **Fast Data Transfer** 等を確認。
- **Pro で得しやすいもの**: ログ保持の拡大、ビルド並列、チーム席、メールサポート、オーバージュで上限超過時の扱い、WAF ルール数など。

### いつ Pro に上げるか（目安）

- **商用提供を始める時点**（Hobby の条件を満たさなくなる前後）。
- **デプロイ頻度・プレビュー・チーム開発**で Hobby のデプロイ数／ビルド分に当たりそうなとき。
- **本番ログを長時間残したい**、サポートが欲しいとき。

## 信頼性（プロダクト観点）

- **インシデント対応**: 障害連絡手段、データ復旧の期待値（README やステータスページで明示するか）。
- **環境分離**: 無料 Supabase が 2 プロジェクトのため **本番 + ステージング**で枠を使い切るパターンが典型。E2E 専用を足すと **別オーガ or 有料**の判断が出る（[quality-and-ci.md](quality-and-ci.md)）。

GitHub 上に **課金しきい値専用のイシューは未整理**のため、ダッシュボードの実測と本メモの「最終確認日」更新をセットにするとよい。
