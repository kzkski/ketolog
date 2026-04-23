# Contributing Guide

このリポジトリは **GitHub Flow** に従って開発を進めます。

---

## GitHub Flow の基本ルール

1. **`main` は常にデプロイ可能な状態を保つ**
   - `main` への直接コミットは禁止
   - すべての変更は Pull Request 経由でマージする

2. **作業ブランチを切る**
   - `main` から最新を取得してブランチを作成する
   - ブランチ名は内容が分かる名前にする（下記の命名規則を参照）

3. **こまめにコミット・プッシュする**
   - 作業途中でもリモートにプッシュして進捗を残す

4. **Pull Request を作成する**
   - 実装が完了したら PR を作成し、Issue と紐づける
   - PR タイトルは変更内容を簡潔に表す

5. **マージ後はブランチを削除する**

---

## ブランチ命名規則

| 種別 | プレフィックス | 例 |
|---|---|---|
| 新機能 | `feat/` | `feat/menu-grouping` |
| バグ修正 | `fix/` | `fix/import-group-field` |
| ドキュメント | `docs/` | `docs/update-readme` |
| リファクタリング | `refactor/` | `refactor/preset-api` |
| 雑務・設定 | `chore/` | `chore/bump-version` |
| テスト追加 | `test/` | `test/lib-unit` |

---

## ディレクトリ配置規約

新しいファイルを追加する際は以下の規約に従う。詳細は [AGENTS.md](AGENTS.md) も参照。

| 置き場 | 対象 |
|---|---|
| `src/app/<page>/_components/` | そのページ専用の UI コンポーネント |
| `src/app/<page>/_hooks/` | そのページ専用の React hooks |
| `src/app/<page>/actions/` | Server Actions（責務別ファイルに分割・バレル index.ts は作らない） |
| `src/components/` | 複数ページで使う共通 UI コンポーネント |
| `src/hooks/` | 複数ページで使う共通 React hooks |
| `src/lib/` | ビジネスロジック・ユーティリティ（UI に依存しない pure な関数） |
| `src/lib/constants/` | アプリ全体で共有する定数 |
| `src/types/` | 型定義（DB スキーマ型は `database.ts` を正とする） |
| `packages/domain/` | Web / Mobile 共通の UI 非依存ロジック（`@ketolog/domain/*`） |
| `packages/types/` | Web / Mobile 共通の共有型（`@ketolog/types`） |

### Server Actions の import ルール

`"use server"` が宣言されたファイルは**バレル経由でなく直接インポート**すること。

```typescript
// ✅ 正しい
import { saveMealToLog } from './actions/food-log';
// ❌ 避ける（バレル経由）
import { saveMealToLog } from './actions';
```

---

## 作業の流れ

```bash
# 1. main を最新にする
git checkout main
git pull

# 2. ブランチを作成
git checkout -b feat/your-feature-name

# 3. 実装・コミット（繰り返し）
#    feat/ または fix/ の PR では、package.json のバージョン更新コミットも含める（下記「バージョン管理」を参照）
git add <files>
git commit -m "feat: ..."

# 4. リモートにプッシュ
git push -u origin feat/your-feature-name

# 5. GitHub で Pull Request を作成
#    - Issue 番号を本文に記載（例: "closes #17"）
#    - ビルドが通っていることを確認してマージ

# 6. マージ後、ブランチを削除
git checkout main
git pull
git branch -d feat/your-feature-name
```

### バンドル分析（任意）

パフォーマンス調査時、`.env.local` を用意したうえで `npm run analyze` を実行すると、`next build --webpack` 完了後に Bundle Analyzer のレポートが開く（Next.js 16 の既定 Turbopack ビルドでは analyzer は動かない）。`client.html` / `nodejs.html` / `edge.html` の意味と、**`edge.html` が空に見えることがある**点は [README.md](README.md) の同セクションの表を参照。

---

## コミットメッセージ規則

[Conventional Commits](https://www.conventionalcommits.org/) に従う。

```
<type>: <概要>

<本文（任意）>
```

| type | 用途 |
|---|---|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `refactor` | 動作を変えないコード変更 |
| `chore` | ビルド・設定・バージョン変更など |

---

## Issue と PR の対応

- 実装前に Issue を立てて方針を合意する
- PR は対応する Issue を `closes #<番号>` で参照する
- Issue がない緊急バグ修正は PR 作成時に説明を記載する

### Issue ラベル運用（管理しやすさのための最小ルール）

- 新規 Issue 作成時は、原則として **`platform` / `type` / `priority`** の3系統を付ける
- 親子構造で進めるテーマ（例: ネイティブ化 PoC）は、親・子ともに同じ `epic:*` を付ける
- PR 作成時は、対応 Issue と同じラベル群を最低1系統以上引き継ぐ

| 系統 | 必須度 | 例 |
|---|---|---|
| `epic:*` | 親子Issueで推奨 | `epic:native-poc` |
| `platform:*` | 必須 | `platform:web` / `platform:mobile` / `platform:shared` |
| `type:*` | 必須 | `type:feature` / `type:fix` / `type:perf` / `type:docs` / `type:ops` |
| `priority:*` | 必須 | `priority:p0` / `priority:p1` / `priority:p2` |
| `track:*` | リリース運用で推奨 | `track:v2-1` / `track:v2-2` / `track:v3` |

---

## マージ運用（ブランチ保護）

- ブランチ保護を**バイパスする操作は原則禁止**（例: `gh pr merge --admin`）。
- やむを得ずバイパスが必要な場合は、**実行前に理由・影響を説明し、明示的な承認を得る**。
- 通常マージできない場合（例: `base branch policy prohibits the merge`）は、**その場で停止**し、PR のブロッカー（required checks / review / conversation）を確認して報告する。
- 報告後は **60〜120秒待機して再確認**を行い、`mergeable` が `MERGEABLE` かつ required checks が成功してから通常マージを再試行する。
- 上記の再確認を実施する前に、`--admin` へフォールバックしてはならない。

---

## バージョン管理（Semantic Versioning）

`package.json` の `version` は [Semantic Versioning](https://semver.org/) に従う。

### PR にバージョン更新を含めるか

| ブランチの種類 | バージョンを上げるか |
|---|---|
| `feat/` | はい（マイナー） |
| `fix/` | はい（パッチ） |
| `docs/` / `chore/` / `refactor/` のみ | いいえ（上げなくてよい） |

- **`feat/`**（新機能）: マイナー版を上げる（例: 1.2.x → 1.3.0）
- **`fix/`**（バグ修正）: パッチ版を上げる（例: 1.2.1 → 1.2.2）

### バージョン更新コミット

`feat/` または `fix/` の PR では、**必ず** `package.json` のバージョン更新を **単独のコミット** として含める。コミットメッセージは次の形式にする。

```
chore: バージョンを X.Y.Z に更新
```

---

## Changelog 運用

`CHANGELOG.md` はユーザー向けの変更点を簡潔に残す。

- **`feat/` / `fix/` / `refactor/` / `docs/` ブランチの PR は、原則 `CHANGELOG.md` 更新を必須**とする
- **`feat/` / `fix/` の PR で `package.json` のバージョンを上げる場合**（`chore: バージョンを X.Y.Z に更新` を含める場合）、**その PR がリリースするユーザー向け変更を `## [Unreleased]` から `## [X.Y.Z] - YYYY-MM-DD` に移す**。`[Unreleased]` には未リリースの予定分だけを残す（リリース済みの箇条書きを置いたままにしない）。
- `chore/` のみの変更は必須ではない（必要に応じて更新は可）
- `ROADMAP.md` は背景・計画・補足を扱い、リリース要点は `CHANGELOG.md` を正とする
- **CI で自動検証しているのは次のとおり**（`.github/workflows/pr-guardrails.yml`）:
  - **`require-changelog`**: `feat/`・`fix/`・`refactor/`・`docs/` の PR について、ベースブランチとの差分に **`CHANGELOG.md` が含まれること**（含まれないと CI が失敗する）
  - **`require-changelog-version-heading`**: ベースと比べて **`package.json` の `version` が変わった PR** では、**`CHANGELOG.md` に同じ版の見出し**（`## [X.Y.Z]` で始まる行、例: `## [X.Y.Z] - YYYY-MM-DD`）**があること**。ブランチ種別に関わらず、版を上げた PR では適用される（`scripts/ci/verify-changelog-version-heading.mjs`）
- **次の項目は現状 CI では検証していない**。PR テンプレのチェックとレビューで確認する:
  - `## [Unreleased]` にリリース済みの箇条書きが残っていないこと（版見出しの存在は検証するが、Unreleased の中身までは見ない）
