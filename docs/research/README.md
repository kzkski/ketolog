# 市場調査・戦略メモ（参考）

ベータ公開・一般公開に向けた**外部調査（Deep Research 等）の成果物**をリポジトリに置く場所です。数値・出典は調査時点の二次情報に依存するため、意思決定の際は**原文と一次情報の再確認**を前提とする。

## ドキュメント一覧

| ファイル | 元タイトル（生成時） | 概要 |
|----------|---------------------|------|
| [health-tech-market-ketolog-strategy.md](health-tech-market-ketolog-strategy.md) | ヘルスケアアプリ市場調査：Ketolog戦略 | データ基盤・エコシステム（Ketovisor 等）視点、日本（パターンA）/ 海外含む（パターンB）の TAM/SAM/SOM、汎用カロリーアプリ中心の競合、ベータ・GA の検証論点 |
| [ketolog-market-keto-log-platform-strategy.md](ketolog-market-keto-log-platform-strategy.md) | Ketolog 市場調査レポート：ケト特化ログ基盤の機会と戦略 | 日本語圏ホワイトスペース、セグメント、競合表、成功指標と収益ストーリー、パターン A/B のリリース順 |

## リポジトリ方針への反映

レポートのうち、**正本ドキュメントへ要約として取り込んだ**対応関係は次のとおり。TAM/SOM などの数値は調査時点の参考であり、意思決定時は一次情報の再確認を前提とする。

| 反映先 | 取り込んだ内容 |
|--------|----------------|
| [ROADMAP.md](../../ROADMAP.md)（方針メモ） | ログ基盤＋下流価値、日本優先・海外は段階的、併用からの獲得、プリセット／JSON／PFC の投資軸 |
| [docs/release/beta-checklist.md](../release/beta-checklist.md)（§8） | ベータで検証したい仮説・観測指標の参考リスト（ゲート必須ではない） |
| [docs/release/general-availability-checklist.md](../release/general-availability-checklist.md)（§4） | GA 以降のスケール・エコシステム系 KPI を追う余地の注記 |

## リポジトリ内の動線

- **製品・ロードマップ**: [ROADMAP.md](../../ROADMAP.md)（Ketovisor 分担、Phase 方針）
- **公開ゲート・運用**: [docs/release/README.md](../release/README.md)（ベータ / GA チェックリスト、コスト、コンプライアンス）
- **プロダクト概要**: [README.md](../../README.md)

調査内容の確定版や更新方針は、必要に応じて本 README か各レポート先頭に短いメモを足すとよい。
