# Ketolog

ケトジェニックダイエット特化の個人用食事管理Webアプリ。

外食・自炊・コンビニのPFC（タンパク質・脂質・糖質）をリアルタイムに記録・管理する。市販の汎用ダイエットアプリでは対応しにくい「外食メニューの登録」「PFC目標の柔軟な設定」「JSONプリセットによるデータ共有」に対応。

**注意**: 現時点では **一般向けには公開していません**（テスト用途のデプロイ）。認証・公開範囲の詳細と今後の予定は [ROADMAP.md](ROADMAP.md) を参照。

## 主な機能

- **食事ログ記録**: 朝食/昼食/夕食/間食ごとに PFC をリアルタイム入力
- **PFCバー**: 今日の残枠を常時表示（タンパク質・脂質・糖質）
- **レストラン&メニュー管理**: よく行く店・自炊向け「汎用食材」などのメニューを登録し、**お気に入り**で定番を先頭タブから選べる
- **日付ナビゲーション**: 過去の記録を閲覧・編集・削除
- **JSON エクスポート/インポート**: レストランとメニューを JSON で持ち出し・取り込み
- **プリセット**: リポジトリに同梱した JSON がビルドに含まれ、**`/presets/` 経由で静的配信**される。アプリの **＋ → プリセットから選ぶ** でワンタップインポート
- **認証**: Supabase Auth。将来はメール／パスワードと Google OAuth を想定（現状の制約は [ROADMAP.md](ROADMAP.md) を参照）

## 技術スタック

| 分類 | 採用技術 |
|---|---|
| フロントエンド | Next.js 16.2.3 App Router（React 19） |
| バックエンド | Supabase（PostgreSQL + RLS） |
| 認証 | Supabase Auth |
| ホスティング | Vercel |

## プリセット

`public/presets/` にレストラン・メニューの JSON があり、デプロイ時に **`/presets/ファイル名.json`** として配信されます。アプリから **＋ → プリセットから選ぶ** で取得してインポートできます。

→ [プリセット一覧と手順](public/presets/)

## ローカル開発

```bash
npm install

# 環境変数（.env.example をコピーして編集）
cp .env.example .env.local
# .env.local に Supabase の URL と anon key を記入
```

`.env.local` の変数名は [.env.example](.env.example) と同じです。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

開発サーバー:

```bash
npm run dev
```

### モバイル表示の手元確認

ローカルでブラウザから確認する際、開発者ツールのレスポンシブ／デバイスモードで **viewport の幅を変えれば**、スマートフォン相当のレイアウトや主要な挙動を **最低限** 確認できます。実機や Playwright などの E2E での回帰テストは、必要になったタイミングで別途検討してください。

## Open Food Facts API

バーコードから商品情報を取り込む機能は [Open Food Facts](https://world.openfoodfacts.org)（OFF）の API を利用する。利用前に次を確認すること。

### 必須の運用（公式ガイド）

1. **利用規約・ライセンス**  
   [Terms of use, contribution and re-use](https://world.openfoodfacts.org/terms-of-use)（データは ODbL 等。**帰属表示**が必要。アプリ内にクレジット表示あり）

2. **カスタム User-Agent**  
   [API ドキュメント](https://openfoodfacts.github.io/openfoodfacts-server/api/)のとおり、リクエストに **`AppName/Version (連絡先メール)`** 形式の User-Agent を付ける（未設定時はコード内のデフォルトが使われる）

3. **API 利用の申告（usage form）**  
   公式が [API usage form](https://docs.google.com/forms/d/e/1FAIpQLSdIE3D8qvjC_zRJw1W8OmuHhsWJ_NSckiiniAHlfaVwUZCziQ/viewform) で利用実態の把握を依頼している。**本番公開前に提出**し、アプリ名・URL・想定トラフィック・連絡先などを記載する

4. **レート制限**  
   商品取得（`GET /api/v*/product`）は **100 req/min** などエンドポイント別に制限がある。アプリ側では `shared_products` キャッシュで再取得を抑える

5. **ステージング**  
   本番と別検証には [world.openfoodfacts.net](https://world.openfoodfacts.net/)（Basic 認証あり。ドキュメント参照）

### 環境変数（任意）

[.env.example](.env.example) 参照。

| 変数 | 説明 |
|---|---|
| `OFF_USER_AGENT` | 上記形式で上書き（チームで連絡先を統一する場合に使用） |
| `OFF_API_BASE` | デフォルトは `https://world.openfoodfacts.org`。検証時のみステージング URL に変更 |

## フェーズ設計

| フェーズ | P | F | C（糖質） | 状態 |
|---|---|---|---|---|
| Phase 1（ケト脂肪燃焼） | 100g | 120g | 上限 40g | 現在 |
| Phase 2（TKD導入） | 110g | 110g | 60g | 体重65kg到達時 |
| Phase 3（アイアンマン） | 120g | 100g | 100g | 体重60kg以下 |

→ [実装ロードマップ](ROADMAP.md)
