# Ketolog Mobile (Expo)

`apps/mobile` は Native PoC 用の Expo アプリです。

## 前提

- Node.js 20 以上
- Xcode（iOS シミュレータで確認する場合）
- Expo Go（実機確認する場合）

## セットアップ

リポジトリのルートで次を実行します。

```bash
npm install
```

## 起動

リポジトリのルートで次を実行します。

```bash
# Expo Dev Server 起動
npm run mobile:start

# iOS シミュレータで起動
npm run mobile:ios
```

## 最小チェック

```bash
npm run mobile:typecheck
```

## 共有パッケージ（`@ketolog/domain` / `@ketolog/types`）

モノレポ直下の `packages/` を `package.json` の workspaces から参照する。`App.tsx` で共有ロジックの import を確認できる。

import ルールの詳細はリポジトリ直下の [AGENTS.md](../../AGENTS.md)（「Monorepo 共有パッケージ」）を参照。
