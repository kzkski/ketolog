# Ketolog

ケトジェニックダイエット特化の個人用食事管理Webアプリ。

外食・自炊・コンビニのPFC（タンパク質・脂質・糖質）をリアルタイムに記録・管理する。市販の汎用ダイエットアプリでは対応しにくい「外食メニューの登録」「PFC目標の柔軟な設定」「JSONプリセットによるデータ共有」に対応。

## 主な機能

- **食事ログ記録**: 朝食/昼食/夕食/間食ごとに PFC をリアルタイム入力
- **PFCバー**: 今日の残枠を常時表示（タンパク質・脂質・糖質）
- **レストラン&メニュー管理**: よく行く店・マイフードのメニューを登録してすばやく呼び出し
- **日付ナビゲーション**: 過去の記録を閲覧・編集・削除
- **JSON エクスポート/インポート**: レストランとメニューを JSON で持ち出し・取り込み
- **プリセット**: GitHub 上のプリセット集から1タップでインポート
- **認証**: メール/パスワード + Google OAuth（Supabase Auth）

## 技術スタック

| 分類 | 採用技術 |
|---|---|
| フロントエンド | Next.js 15 App Router (React) |
| バックエンド | Supabase (PostgreSQL + RLS) |
| 認証 | Supabase Auth (Google OAuth) |
| ホスティング | Vercel |

## プリセット

`public/presets/` ディレクトリにレストラン・メニューの JSON プリセットが入っています。  
アプリの **＋ → プリセットから選ぶ** からワンタップでインポートできます。

→ [プリセット一覧](public/presets/)

## ローカル開発

```bash
# 依存パッケージのインストール
npm install

# 環境変数を設定
cp .env.local.example .env.local
# .env.local に Supabase の URL と anon key を記入

# 開発サーバー起動
npm run dev
```

`.env.local` に必要な変数:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx
```

## フェーズ設計

| フェーズ | P | F | C | 状態 |
|---|---|---|---|---|
| Phase 1 (ケト脂肪燃焼) | 100g | 120g | 40g | 現在 |
| Phase 2 (TKD導入) | 110g | 110g | 60g | 体重65kg到達時 |
| Phase 3 (アイアンマン) | 120g | 100g | 100g | 体重60kg以下 |

→ [実装ロードマップ](ROADMAP.md)
