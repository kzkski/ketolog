# 第三者サービス・コンプライアンス

## Open Food Facts（OFF）

- **API 利用申告**: プロジェクトでは **実施済み**とする。README の「本番公開前に提出」等の文言は、現状に合わせて [README.md](../../README.md) 側を更新する余地あり。
- **継続義務**（実装・運用の両方）:
  - [Terms of use, contribution and re-use](https://world.openfoodfacts.org/terms-of-use) の遵守
  - **帰属表示**（アプリ内クレジットは設定ドロワー等に記載）
  - **User-Agent**: `AppName/Version (連絡先メール)` 形式。[`.env.example`](../../.env.example) の `OFF_USER_AGENT`。未設定時のデフォルト連絡先は [`src/app/today/actions/menu-item.ts`](../../src/app/today/actions/menu-item.ts) の定数を参照し、実運用の連絡先と一致させる。
  - **レート制限**: 商品取得などエンドポイント別に制限あり。`shared_products` キャッシュで再取得を抑える（[README.md](../../README.md)「Open Food Facts API」）。
- **設計の背景**: [Issue #2](https://github.com/kzkski/ketolog/issues/2)

## 新規に外部 API を追加するとき（テンプレ）

- 利用規約・プライバンス・表示義務（帰属、商標）
- 申告・API キー・レート制限・User-Agent 等の技術要件
- 本番・ステージングでのキー分離
- README と `.env.example` への追記
- ユーザー向けプライバシーポリシーへの第三者提供の記載
