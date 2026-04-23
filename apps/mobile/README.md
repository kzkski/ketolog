# Ketolog Mobile (Expo)

`apps/mobile` は Native PoC 用の Expo アプリです。ログイン後のメインは **Today（JST 日付・PFC バー・フェーズ切替）**の MVP 表示（[#267](https://github.com/kzkski/ketolog/issues/267)）。食事の詳細操作は引き続き Web 版（同じ Supabase プロジェクト）を想定。

**アイコン・スプラッシュ**: `assets/icon.png`（ホーム画面／ストア用）・`splash-icon.png`・`adaptive-icon.png`・`favicon.png`・Today 用の `brand-header.png` は、リポジトリ正として [`public/icons/`](../../public/icons/) の Ketolog ロゴからコピーして揃えている。Web 側の見た目を更新したら同じファイルを `apps/mobile/assets/` に上書きコピーする。

**`npm run mobile:ios:run` がすぐ終わるとき**: `app.config.ts` に `ios.bundleIdentifier`（と Android 用の `android.package`）が無いと `expo prebuild` が失敗し、ターミナルに一行も出ず終了することがある。現在は `com.ketolog.mobile` を設定済み。初回は Xcode が `ios/` を生成するまで数分かかる。`ios/` / `android/` は `.gitignore` している（CNG 前提）。ネイティブディレクトリをコミットしたい場合はルート `.gitignore` の該当行を外す。

**Expo Go とネイティブの見え方（重要）**: `npm run mobile:ios`（`expo start --ios`）で **Expo Go** が立ち上がる場合、白背景に同心円のような絵と **「Building JavaScript bundle…」** が出る画面は **開発サーバ接続用の UI** で、`app.config` のスプラッシュやアプリアイコンとは別です。ホーム画面のアイコン・起動スプラッシュを Ketolog のネイティブアセットで確認するには、リポジトリルートから **`npm run mobile:ios:run`**（`apps/mobile` をカレントに `expo run:ios`）で **開発ビルドをシミュレータにインストール**してください（初回は Xcode ビルドに時間がかかります）。**リポジトリ直下で `npx expo run:ios` や誤ったルート用 `npm run ios` を実行しないでください**（ルートに `App.tsx` が無く `Unable to resolve ../../App` になります）。`app.config` や画像を変えたあとは `--no-build-cache` を付けるか、シミュレータ上の当該アプリを削除してから再ビルドすると確実です。Metro のみの再起動なら `npx expo start apps/mobile -c` でキャッシュを消せます。

## 前提

- Node.js 20 以上
- Xcode（iOS シミュレータで確認する場合）
- Expo Go（実機確認する場合）

## セットアップ

リポジトリのルートで次を実行します。

```bash
npm install
```

### Supabase 認証（Issue #266 / PoC）

1. `apps/mobile/.env.example` を `apps/mobile/.env` にコピーし、`EXPO_PUBLIC_SUPABASE_URL` と `EXPO_PUBLIC_SUPABASE_ANON_KEY` を Web（`NEXT_PUBLIC_SUPABASE_*`）と**同じプロジェクト**の値で埋める。
2. **Supabase ダッシュボード**（Authentication → URL Configuration）の **Redirect URLs** に、少なくとも次のパターンを含める（Google OAuth・PKCE の戻り先用）。
   - カスタムスキーム（`app.config.ts` の `scheme: "ketolog"`）: `ketolog://**` または `ketolog://auth/callback`（必要に応じて両方）
   - **Expo Go 開発時**は、ターミナルに表示される `exp://` 系のリダイレクトが変わるため、エラーに含まれる URL を見ながら **Redirect URLs に都度追加**するか、通し用の `exp://**` が許可できる場合はルールに従って登録する。
3. 環境変数を変えたら `npx expo start`（Metro）を**再起動**する。

**Email/Password** と **Google ログアウト** は、未ログイン時に Today 等の保護画面へは遷移しない（ログイン / 再ログイン画面のみ）構成になっている。セッションは `AsyncStorage` に永続化し、アプリ再起動後も `getSession` で復元する。

**Web との競合を避けるには**: 同じ Supabase プロジェクト内で、Next.js 用（例: Vercel の `https://.../auth/callback`）は既存のまま、上記に **Expo 用の `ketolog://` / `exp://` を足す**だけにするとよい。Site URL や他プロバイダー設定を差し替えない。

## 起動

**リポジトリのルート**で次を実行します（`apps/mobile` を対象にした Expo です）。

```bash
# Expo Dev Server 起動
npm run mobile:start

# iOS シミュレータで起動
npm run mobile:ios
```

`react-native` / Expo の解決上、**リポジトリ直下で `npx expo start` だけ**を実行すると、ルートに `App.tsx` が無いため `Unable to resolve module ../../App` になります。上記 `npm run` か、**必ず** `npx expo start apps/mobile`（第1引数に `apps/mobile`）を使ってください。

### Metro / React が混ざるとき

Next（ルート）と Expo で **別バージョンの `react` が併存**すると「`Cannot read property 'useState' of null`」等になる。リポジトリルートの `package.json` に **`overrides` で `react` / `react-dom` を 1 本化**し、`apps/mobile` の `react` も **19.2.4**（ルートと同じ）に揃えている。`metro.config.js` の `extraNodeModules` は hoisted 先の実パスを `require.resolve` している。まだ出る場合は `npx expo start apps/mobile -c` でキャッシュを消して再試行する。

## 最小チェック

```bash
npm run mobile:typecheck
```

## 共有パッケージ（`@ketolog/domain` / `@ketolog/types`）

モノレポ直下の `packages/` を `package.json` の workspaces から参照する。`App.tsx` で共有ロジックの import を確認できる。

import ルールの詳細はリポジトリ直下の [AGENTS.md](../../AGENTS.md)（「Monorepo 共有パッケージ」）を参照。
