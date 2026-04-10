# Ketolog

ケトジェニックダイエット特化の個人用食事管理Webアプリ。

外食・自炊・コンビニのPFC（タンパク質・脂質・糖質）をリアルタイムに記録・管理する。市販の汎用ダイエットアプリでは対応しにくい「外食メニューの登録」「PFC目標の柔軟な設定」「JSONプリセットによるデータ共有」に対応。

**注意**: 現時点では **一般向けには公開していません**（テスト用途のデプロイ）。認証・公開範囲の詳細と今後の予定は [ROADMAP.md](ROADMAP.md) を参照。

## 主な機能

- **食事ログ記録**: 朝食/昼食/夕食/間食ごとに PFC をリアルタイム入力
- **PFCバー**: 今日の残枠を常時表示（タンパク質・脂質・糖質）
- **レストラン&メニュー管理**: よく行く店・マイフードのメニューを登録してすばやく呼び出し
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

## フェーズ設計

| フェーズ | P | F | C（糖質） | 状態 |
|---|---|---|---|---|
| Phase 1（ケト脂肪燃焼） | 100g | 120g | 上限 40g | 現在 |
| Phase 2（TKD導入） | 110g | 110g | 60g | 体重65kg到達時 |
| Phase 3（アイアンマン） | 120g | 100g | 100g | 体重60kg以下 |

→ [実装ロードマップ](ROADMAP.md)
