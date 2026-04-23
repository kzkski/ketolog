# iOS 配布導線（EAS Build / TestFlight）

Issue: [#271](https://github.com/kzkski/ketolog/issues/271)  
親Issue: [#263](https://github.com/kzkski/ketolog/issues/263)

Expo アプリ（`apps/mobile`）の iOS 配布を、担当者依存を下げて再現できるようにするための手順書。

## 目的

- TestFlight でインストール可能なビルドを継続的に配布できる。
- 署名・Bundle ID・環境変数の管理ポイントを固定する。
- 失敗時の切り分けを最短で行えるようにする。

## 前提（最初に一度だけ）

1. Apple Developer Program に参加済み。
2. App Store Connect にアプリを作成済み。
   - Bundle ID: `com.ketolog.mobile`（`apps/mobile/app.config.ts` と一致）
3. Expo アカウントにログインできる。
4. `apps/mobile/eas.json` がリポジトリに存在する。

## 必須設定（App Store Connect / EAS）

### 1) App Store Connect 側

- `App Store Connect > Apps` で iOS App を作成。
- App 情報の Bundle ID が `com.ketolog.mobile` であることを確認。
- App の数値 ID（App Store Connect App ID）を控える。

### 2) EAS 側の環境変数

`production` 環境に、少なくとも次を設定する。

- `EXPO_PUBLIC_SUPABASE_PRODUCTION_URL`
- `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY`

`EXPO_ASC_APP_ID` は `apps/mobile/eas.json` の submit profile で固定しているため、EAS env への登録は任意。

## 日常の配布フロー

作業ディレクトリはリポジトリルートを想定。

1. 変更を `main` に取り込んだブランチで確認する。
2. 型チェックを通す。
   - `npm run mobile:typecheck`
3. 本番向け iOS ビルドを作る。
   - `npm --prefix apps/mobile run eas:build:ios:production`
4. Build 完了後、TestFlight へ submit する。
   - `npm --prefix apps/mobile run eas:submit:ios:production`
5. App Store Connect の TestFlight で対象 build が `Ready to Test` になることを確認する。
6. テスターを追加し、インストール可能であることを確認する。

## GitHub Actions での自動化（推奨）

手作業を減らすため、[`mobile-ios-testflight-release.yml`](../../.github/workflows/mobile-ios-testflight-release.yml) を用意している。

### 必要な GitHub Secrets（Environment: `production`）

- `EXPO_TOKEN`（Expo の personal access token）
- `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY`
- `SUPABASE_PROJECT_REF`（既存の DB migration 用 secret を再利用可。workflow 内で `https://<ref>.supabase.co` を組み立てる）

### 実行方法

1. GitHub の **Actions** タブで `Mobile iOS TestFlight Release` を選択
2. `Run workflow` を押す
3. `reason`（必須）と `git_ref`（既定は `main`）を入力して実行

ワークフロー内で `mobile:typecheck` -> `eas build --auto-submit` を順に実行し、TestFlight 送信まで自動で行う。

## 運用上のルール

- **証明書は EAS Managed を優先**し、手動証明書運用を避ける（引き継ぎコスト削減）。
- **Bundle ID は固定**（`com.ketolog.mobile` を変更しない）。
- **配布ログを残す**: 実施日、build 番号、担当、結果、失敗時メモを Issue コメントに追記する。
- **最低 1 回の配布サイクル**（Build -> Submit -> TestFlight install）を各マイルストーンで実施する。

## 失敗時の切り分けメモ

### `No value found for ascAppId`

- 症状: submit 実行時に App Store Connect App ID が未設定で失敗する。
- 対応: `EXPO_ASC_APP_ID` が EAS の `production` 環境に設定されているか確認する。

### 証明書/Provisioning Profile エラー

- 症状: build 中に signing 関連で失敗する。
- 対応:
  1. `npm --prefix apps/mobile run eas:credentials:ios` で状態確認
  2. 不整合がある場合は EAS Managed で再生成
  3. 再度 `eas build --platform ios --profile production`

### `bundleIdentifier` 不一致

- 症状: submit 時に App Store Connect の App と紐づかない。
- 対応: `apps/mobile/app.config.ts` の `ios.bundleIdentifier` が `com.ketolog.mobile` か確認する。

### TestFlight 側で Build が出ない / Processing が長い

- 症状: submit 成功後に TestFlight へ反映されない。
- 対応:
  1. App Store Connect の Activity を確認
  2. 数十分待機して再確認（Apple 側処理遅延の可能性）
  3. EAS submit ログの build ID と Apple 側 build 番号の対応を確認

## Tracking

- Status: In progress
- Track: v3
- Tracking Issue: [#271](https://github.com/kzkski/ketolog/issues/271)
- Owner: TBD
- DoD: TestFlight でインストール可能な iOS ビルドを配布でき、手順と失敗時対応がこの文書で再現できる。
