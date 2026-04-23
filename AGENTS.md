<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## リポジトリ運用（GitHub Flow）

開発の手順・ブランチ名・コミット規約・**`package.json` のバージョン更新タイミング**は、すべて **CONTRIBUTING.md** に従う。

- `main` への直接コミットは禁止。作業ブランチで実装し、PR でマージする。
- Issue がある場合は PR で `closes #<番号>` などと紐づける。
- `feat/` の PR ではマイナー、`fix/` の PR ではパッチを上げる。`docs` / `chore` / `refactor` のみの変更では上げなくてよい（詳細は CONTRIBUTING.md）。
- ブランチ保護のバイパス操作（例: `gh pr merge --admin`）は原則禁止。通常マージ失敗時は停止し、ブロッカー確認と60〜120秒待機後の再確認を行う。必要時は実行前に理由と影響を示し、明示承認を得る。

Cursor では **`.cursor/rules/github-flow.mdc`** が常時適用され、上記と同じ方針が補強される。

## Monorepo 共有パッケージ（Web / Mobile）

- **`@ketolog/domain`**: UI に依存しない共有ロジック。サブパス import（`@ketolog/domain/pfc` など）を使う。
- **`@ketolog/types`**: Web / Mobile で共有する型（DTO 等）の再エクスポート。**DB 行型の正は引き続き** `src/types/database.ts`（Web）を用い、スキーマ型の大量移管は別 Issue で扱う。

```typescript
// 例: 純粋関数
import { sumPfc } from "@ketolog/domain/pfc";
import { toJstDateString } from "@ketolog/domain/date";
import { getMealTypeForTimeZone } from "@ketolog/domain/meal-timezone";

// 例: 型だけ（PfcGrams / MealType など）
import type { PfcGrams, MealType } from "@ketolog/types";
```

Next.js は `transpilePackages`（`next.config.ts`）で workspace パッケージをトランスパイルする。Expo は `apps/mobile/metro.config.js` でモノレポの `node_modules` 解決と watch 対象を合わせる。

## src/ ディレクトリ規約

新しいファイルを追加する前に、以下の配置規約に従う。

### today ページ内（`src/app/today/`）

| フォルダ | 対象 |
|---|---|
| `_components/` | そのページ専用の UI コンポーネント（Next.js の private folder 規約） |
| `_hooks/` | そのページ専用の React hooks |
| `actions/` | Server Actions（`"use server"` 宣言付きファイル。**バレル index.ts は作らない**） |

> **Server Actions の import**: `"use server"` が宣言されたファイルから**直接インポート**すること。バレル（index.ts）経由の再エクスポートは Next.js で正常に動作しない場合がある。
>
> ```typescript
> // ✅ 正しい
> import { saveMealToLog } from './actions/food-log';
> // ❌ 避ける
> import { saveMealToLog } from './actions';
> ```

### lib/（`src/lib/`）

| フォルダ / ファイル | 対象 |
|---|---|
| `lib/constants/` | アプリ全体で共有する定数（`meal.ts` など） |
| `lib/supabase/` | DB クライアントファクトリ（変更不要） |
| `lib/*.ts` | ドメイン固有のビジネスロジック・ユーティリティ（UI に依存しない。Web / Mobile 共有に切り出したものは `packages/` へ） |

### 共通コンポーネント・hooks

| フォルダ | 対象 |
|---|---|
| `components/` | 複数ページで使う共通 UI コンポーネント |
| `hooks/` | 複数ページで使う共通 React hooks |

### types/（`src/types/`）

- DB テーブルの TypeScript 型定義の正は `database.ts`。新しい DB 関連の型はここに追加する
- ページ固有の型は各コンポーネントファイルまたは `_hooks/` 内で定義してよい

### packages/（`packages/`）

| パッケージ | 対象 |
|---|---|
| `domain/` | Web / Mobile 共通の UI 非依存ロジック（上記 Monorepo 節） |
| `types/` | 共有 DTO 等の型（`@ketolog/types`） |
