# 文科省食品標準成分表連携（Issue #3）

## 概要

「今日」画面のレストランタブ列に **文科省表2023**（仮想タブ）を追加し、文部科学省「日本食品標準成分表（八訂）増補2023」第2章のマスタから名称検索・食品群フィルタで候補を選び、**メニュー追加ドロワー**で PFC を確定・保存する。

- **動線**: バーコード（Open Food Facts）・手入力と同じ `MenuItemDrawer` に集約。
- **追加先のお店**: 成分表タブに入る直前に選んでいたお店をデフォルトとし、パネル上部のセレクトで変更可能。

## データソース

| 項目 | 内容 |
|------|------|
| 根拠データ | 増補2023・第2章（データ）Excel `…_02.xlsx` のシート **表全体** |
| 取得元 URL（2026-04 時点） | `https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx` |
| 版メモ | シート上の更新日（例: 2026年3月27日）を `source_version` 文字列に含める |

正誤表ファイルは差分一覧であり、調査のとおり **第2章本データに正値が反映済み** のため、通常の取り込みは本データのみでよい。将来、正誤表だけ日付が新しく本データが追従していない場合は公式を再取得し、ETL を再実行する。

## P / F / 糖質（C）の列

可食部 **100g あたり**。アプリの「C」は **利用可能炭水化物（質量計）**（成分識別子 `CHOAVL`、Excel 列 P / 1-based 16）。総炭水化物列は使わない。

## データベース

| オブジェクト | 説明 |
|--------------|------|
| `standard_food_items` | マスタ（`food_code` 5桁 PK、`group_code`、`name`、`name_normalized`、P/F/C、`source_version`） |
| `menu_items.standard_food_code` | 任意。マスタの `food_code` を参照（ON DELETE SET NULL） |
| `search_standard_foods(text, text, int, int)` | 上記に加え第4引数 `p_offset`（省略時0）でページ送り。`p_limit` は最大100 |
| RLS | `standard_food_items` は **authenticated の SELECT のみ**（投入はマイグレーション / service_role 想定） |

拡張: `pg_trgm`（GIN + `gin_trgm_ops`）。

## ETL（マスタの再生成）

1. Node.js（プロジェクトの `engines` に特別な指定がなければ LTS 想定）と `npm install` 済みであること。
2. `npm run etl:mext-ch2`  
   - 既定で上記 URL から XLSX を取得し、`supabase/migrations/20260412120001_standard_food_items_seed.sql` を上書きする。  
   - オフライン時は `MEXT_CH2_XLSX_PATH=/path/to/file.xlsx` を指定。
3. 生成 SQL をコミットし、`supabase db push`（または SQL Editor）で DDL（`20260412120000_…`）適用後にシードを適用する。

詳細は `scripts/etl-mext-ch2.mjs` 先頭コメントを参照。

### マイグレーション履歴（開発者向け）

- **空のプロジェクト**へ `supabase db push` だけする場合は、`supabase/migrations/` 内の SQL がタイムスタンプ順にすべて実行され、最終スキーマは一貫する。
- **既にダッシュボードや MCP 等で別の版番号のマイグレーションが記録されている**リンク済みリモートでは、CLI が「リモートにだけある版」とローカルファイル名の不一致で `db push` を拒否することがある。そのときは [migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) で履歴を揃えるか、リモートに記録済みのタイムスタンプに対応する **`20260409015501_remote_history.sql` 等のプレースホルダー**（実質 `SELECT 1` のみ）でローカル側のファイル名を一致させる。中身の再適用は想定していない。

主要ファイルの目安:

| ファイル | 内容 |
|----------|------|
| `20260211120000_baseline.sql` | 既存 public スキーマのベースライン |
| `20260409…_remote_history.sql` / `20260412035245_remote_history.sql` | 上記の履歴整合用（新規環境では no-op） |
| `20260412120000_standard_food_items.sql` | `standard_food_items`・RPC・`menu_items.standard_food_code` |
| `20260412120001_standard_food_items_seed.sql` | マスタデータ（ETL で再生成） |
| `20260412130000_search_standard_foods_offset.sql` | `search_standard_foods` に `p_offset` |

## 名称検索のコツ

- 検索は `name_normalized` に対する **部分一致（`ILIKE`）** と **類似（`pg_trgm`、2 文字以上）**。
- マスタの表記は **「にわとり」「むね」** のように語が分かれていることが多く、俗語の **「鶏むね」** のように連続した文字列は行に存在しない場合があり **ヒットしない**。胸肉なら **むね**・**にわとり**、**ささみ** はそのまま入力するとよい。
- 入力欄のプレースホルダー（例: ささみ、木綿豆腐）は、実際にヒットする語を選んでいる。

## アプリ側

- **Server Action**: `searchStandardFoods`（`src/app/today/actions.ts`）が RPC を呼び出す。
- **定数**: `STANDARD_FOOD_SEARCH_PAGE_SIZE`（40）は Next.js の制約により `src/lib/standard-food-search.ts` に置いている（`"use server"` ファイルでは async 関数以外を `export` できない）。
- **UI**: `src/app/today/StandardFoodPanel.tsx`（食品群チップ・名称検索・**40件ページ送り**〈一覧上下に前へ／次へ〉）、タブ・ドロワー連携は `TodayClient.tsx`。

環境変数の追加は不要（既存の Supabase 接続のみ）。

## ユーザー向けメモ（糖質の定義）

検索パネルおよびメモ欄の初期文で、**糖質（C）は文科省表の「利用可能炭水化物（質量計）」に合わせている**旨を表示する。ラベルや目標値の期待をそろえるため。

## ライセンス・クレジット

政府オープンデータおよび文部科学省の利用条件に従う。画面内に出典を表示する。
