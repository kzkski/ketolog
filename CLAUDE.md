@AGENTS.md
@CONTRIBUTING.md

# 開発ルール（必読）

ブランチ運用・PR・コミット規約・**バージョン管理**（`package.json` / Semantic Versioning）まで、**すべて `CONTRIBUTING.md` に従うこと**。`main` への直接コミットは禁止。詳細はそちらを参照。

---

# 食事管理アプリ 引き継ぎドキュメント

## 概要

ケトジェニックダイエット（フェーズ1: P100g / F120g / C上限40g）に特化した、個人用の食事管理Webアプリ。市販の食事管理アプリ（あすけん・MyFitnessPal等）は汎用ダイエット向けで、ケト特化・外食管理・Supabase連携・AI栄養アドバイスといった要件に対応していないため自作する。

---

## 技術スタック

- **フロントエンド**: Next.js（React）
- **ホスティング**: Vercel（Hobbyプラン・個人利用）
- **DB**: Supabase（既存プロジェクト: `yeqoowzlqzsjvhmjdxbw`）
- **AIモデル**: Claude API（Sonnet系）
- **食品DB**: 文部科学省食品成分表（ローカルインポート）+ Open Food Facts API（バーコードスキャン）

---

## 既存のSupabaseテーブル（現行）

```
daily_log
- date
- weight_kg
- body_fat_pct
- sleep_hours
- calories_burned
- protein_g / fat_g / carbs_g
- exercise
- notes
```

現在は1日1行・集計値での管理。新アプリでは下記の新テーブル設計に移行する。

---

## 新DB設計

```sql
-- 体組成（体重計から取得）
body_composition
- id
- date
- weight_kg
- body_fat_pct
- muscle_mass_kg
- bmr_kcal
- visceral_fat_level
- body_age

-- 1日サマリー（睡眠・活動量）
daily_summary
- id
- date
- sleep_hours
- calories_burned
- exercise
- notes

-- 食事ログ（1食1行・都度記録）
food_log
- id
- date
- meal_type（朝/昼/夕/間食）
- eaten_at（timestamp）
- item_name
- grams
- protein_g
- fat_g
- carbs_g
- source（restaurant_id or 'manual'）
- menu_item_id（nullable）

-- お店・カテゴリマスタ
restaurants
- id
- name（例: 天竜, 神鶏, マイフード）
- category（外食/自炊/コンビニ等）
- notes

-- メニューマスタ
menu_items
- id
- restaurant_id
- name
- p100g / f100g / c100g
- default_grams（1切れ・1単位のデフォルト重量）
- order_count（注文回数・現在はソートに未使用）
- notes
- rank（1=最優先, 2=おすすめ, 3=控えめ, 4=避ける）
- group_name（グループ名・nullable）
- group_order（グループ表示順）
```

---

## 画面・機能設計

### メイン画面（食事記録）

1. **お店・カテゴリ選択**
   - マイフード / 天竜 / 神鶏 / + 新しいお店を追加
   - よく使う順に自動ソート

2. **メニューリスト**
   - ランク順（◎最優先 → ✕避ける）に表示
   - 注文頻度が高いアイテムが上位に自動ソート
   - 各アイテムをタップ → カウントアップ（追加注文にも対応）
   - 1切れの重さをタップで編集可能（✎）
   - PFC値もタップで編集可能（後から修正対応）
   - 「とりあえず名前だけ登録」→ PFCは後から入力できる

3. **残枠バー（常時表示）**
   - P / F / C のリアルタイム進捗バー
   - Supabaseから今日の消費済みPFCを自動取得して残枠計算
   - C（糖質）は逆方向表示（少ないほど良い）

4. **集計タブ**
   - 今夜の注文一覧
   - 合計PFC
   - Supabaseに記録するボタン

### マイフード管理

- バターコーヒー・ゆで卵・チーズ・プロテインなど自炊定番を登録
- グループ分け（朝食セット / 自炊 / スナック 等）
- バーコードスキャンで市販品を登録（Open Food Facts API）
- 食材名検索でPFCを自動取得（文部科学省成分表）

### お店プリセット管理

- 新しいお店を追加する際にメニュー写真をAI分析
- 分析結果を確認・編集してプリセットとして保存
- 次回以降はお店を選ぶだけでメニューが表示される

---

## AI機能と使用制限

### AI使用箇所

1. **メニュー写真分析**（お店登録時のみ・1回きり）
2. **食材名からPFC推定**（登録されていない食材）

### 使用制限設計

| プラン | AI分析 | コスト |
|---|---|---|
| 無料 | 月3回まで | アプリ負担 |
| 有料 | 無制限 | 月額課金 |
| BYOKプラン | 無制限 | 自前APIキー |

- AIは「一度使って結果を蓄積・再利用」する設計
- 毎回AIを使わない（バーコード・マイフード・プリセットで8割カバー）

---

## フェーズ設計（ロードマップ）

詳細は `ROADMAP.md` を参照。

### ダイエットフェーズ（PFC目標値）

| フェーズ | 条件 | P | F | C |
|---|---|---|---|---|
| Phase 1（現在） | 体重65kgまで | 100g | 120g | 上限40g |
| Phase 2 | 体重65kg到達・運動導入 | 110g | 110g | 60g |
| Phase 3 | 体重60kg以下・アイアンマン | 120g | 100g | 100g |

アプリはフェーズに応じてPFC目標値を切り替えられる設計にする。

---

## v1.2.0 実装済み機能（2026-04-09）

### 主要ファイル構成

```
src/
  app/
    today/
      page.tsx          # サーバーコンポーネント（Supabase fetch・初期データ渡し）
      TodayClient.tsx   # メイン画面（全UIロジック）
      actions.ts        # Server Actions（DB操作）
    api/
      presets/[file]/
        route.ts        # プリセット配信 API（廃止予定・public/ 移行済み）
    login/page.tsx
    signup/page.tsx
    auth/callback/route.ts  # OAuth コールバック + 初回シード
  proxy.ts              # ミドルウェア（認証チェック + ドメイン制限）
  lib/
    supabase/client.ts  # ブラウザ用 Supabase クライアント
    supabase/server.ts  # サーバー用 Supabase クライアント
    seed.ts             # 初回ログイン時に user_settings・マイフードを作成
  types/database.ts     # FoodLogEntry 等の型定義
public/
  presets/              # プリセット JSON（Vercel 静的配信）
    tenryu.json           # ホルモン焼肉 天竜 高円寺（28アイテム・グループ化済み）✅
    myfood-keto.json      # ケト定番マイフード（17アイテム・グループ化済み）✅
    7eleven-keto.json     # セブンイレブン 🚧
    familymart-keto.json  # ファミリーマート 🚧
    lawson-keto.json      # ローソン 🚧
```

### 実装済み機能一覧

- 食事ログ記録（朝食/昼食/夕食/間食・PFCバーリアルタイム表示）
- 日付ナビゲーション（過去ログ閲覧・編集・削除・過去日への追加）
- レストラン管理（追加・削除・JSON エクスポート/インポート）
- メニュー管理（追加・編集・削除・ランク・グループ名・100g換算入力切替）
- メニューグループ化・折り畳み表示（「控えめ」「避ける」グループはデフォルト折り畳み）
- プリセット（Vercel 静的配信 /presets/ から一覧取得・ワンタップインポート）
- ユーザー設定（PFC目標値カスタマイズ・全データエクスポート）
- 認証（Google OAuth・`@civictech.tv` ドメイン限定）

### 認証・セキュリティ

- Supabase Auth + Google OAuth のみ（Email 無効）
- `proxy.ts` で `@civictech.tv` 以外は signOut してリダイレクト
- RLS: 全テーブルで `auth.uid() = user_id`

### デプロイ

- Vercel: `https://ketlog.vercel.app`
- Supabase プロジェクト: `yeqoowzlqzsjvhmjdxbw`
- GitHub: `https://github.com/kzkski/ketolog`

---

## ホルモン焼肉 天竜 高円寺 メニュープリセット（参考）

ホルモン系: ハツ・ミノ・ハチノス・センマイ・ギアラ・コブクロ・シマチョウ・マルチョウ・レバー・ハラミ・キクアブラ・ホルモン盛り合わせ（味噌ダレ）
定番焼肉: タン・カルビ・ロース・ザブトン・イチボ・ミスジ・ランプ
サイド: 冷奴・生野菜サラダ・わかめスープ
控えめ（デフォルト折り畳み）: ブタバラ・トントロ・キムチ
避ける（デフォルト折り畳み）: ご飯・麺類・焼肉のタレ

1切れデフォルト15g（ホルモン盛り合わせのみ25g）。

---

## カズキさんのよく使う食材（マイフード候補）

- バターコーヒー（グラスフェッドバター + MCTオイル）
- ゆで卵
- WPIプロテイン（X-PLOSION Plain 30g）
- Oikosヨーグルト（113g: P13 / F0 / C3.2）
- 塩サバ（1切れ120g）
- さば水煮缶（190g）
- 鶏もも皮つき（業務スーパー冷凍・1枚約135g）
- 絹ごし豆腐
- ブロッコリー
- カマンベールチーズ
- マカダミアナッツ・くるみ
- ノンアルハイボール（難消化性デキストリン入り）
- ラード・グラスフェッドバター・純オリーブオイル・MCTオイル

---

## 調理油の方針

- 使用OK: ラード・グラスフェッドバター・純オリーブオイル・MCTオイル
- 使用NG: 植物油・キャノーラ油・大豆油（オメガ6過多のため）
- 調理油は全量摂取として計算する

---

## 備考

- このチャット（Claude Projects）が食事管理・ログ記録の場として継続
- アプリ開発はClaude Codeの別プロジェクトで進める
- 将来的にユーザーを広げる場合はDB設計をオープン化対応にする
