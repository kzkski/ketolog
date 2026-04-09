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

---

## 作業の流れ

```bash
# 1. main を最新にする
git checkout main
git pull

# 2. ブランチを作成
git checkout -b feat/your-feature-name

# 3. 実装・コミット（繰り返し）
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
