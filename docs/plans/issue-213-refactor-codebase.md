# Issue #213：コードベース責務分割・パフォーマンス改善 実装計画

[Issue #213](https://github.com/kzkski/ketolog/issues/213) の詳細実装手順書。

---

## 設計方針の決定事項

| 項目 | 決定 |
|---|---|
| コンポーネント間の状態共有 | **props 経由**（TodayClient が state を持ち、子に props として渡す） |
| テストランナー | **Vitest**（設定軽量、ESM 対応良好、Next.js 16 + React 19 との相性が優れる） |
| Ph-2 着手前の設計 | **状態フロー設計ドキュメントを先に作成**（`docs/plans/issue-213-today-state-design.md`） |
| Server Actions のバレルエクスポート | **採用しない**。`"use server"` ファイルから直接インポートする |

---

## フェーズ一覧

| フェーズ | ブランチ | 概要 |
|---|---|---|
| Doc | `docs/refactor-plan-213` | ドキュメント追記（本ファイルを含む） |
| Ph-1 | `refactor/actions-and-lib` | `actions/` 分割 + `lib/constants/meal.ts` / `lib/date.ts` 新設 |
| Ph-1b | `refactor/lib-pfc` | `lib/pfc.ts` 新設 |
| Ph-1.5 | `test/lib-unit` | Vitest セットアップ + lib/ pure functions ユニットテスト |
| Ph-2 設計 | `docs/today-state-design` | TodayClient 状態フロー設計ドキュメント作成 |
| Ph-2a | `refactor/today-2a` | PfcHeader・BarcodeScanner 切り出し |
| Ph-2b | `refactor/today-2b` | CartPanel + useMealLog 切り出し |
| Ph-2c | `refactor/today-2c` | RestaurantPanel + MenuItemList + useRestaurantState 切り出し |
| Ph-2d | `refactor/today-2d` | ItemDrawer + FavoritesPanel 切り出し |
| Ph-3 | `refactor/performance` | next.config.ts 最適化・遅延化 |
| Ph-4 | 別 Issue | コンポーネント・Server Actions テスト |

> `refactor/` ・`docs/` ・`test/` ブランチは CONTRIBUTING.md 規約によりバージョン更新不要。

---

## Ph-1: `actions/` 分割 + `lib/` 統合

### 変更ファイル

| 操作 | ファイル |
|---|---|
| 削除 | `src/app/today/actions.ts` |
| 新規 | `src/app/today/actions/restaurant.ts` |
| 新規 | `src/app/today/actions/menu-item.ts` |
| 新規 | `src/app/today/actions/food-log.ts` |
| 新規 | `src/app/today/actions/favorites.ts` |
| 新規 | `src/app/today/actions/import-export.ts` |
| 新規 | `src/app/today/actions/settings.ts` |
| 新規 | `src/lib/constants/meal.ts` |
| 新規 | `src/lib/date.ts` |
| 更新 | `src/app/today/TodayClient.tsx`（import パス変更のみ） |
| 更新 | `src/app/insights/InsightsClient.tsx`（`MEAL_LABELS` を `lib/constants/meal.ts` から参照） |
| 更新 | `src/lib/header-hint.ts`（JST 関数を `lib/date.ts` から参照） |
| 更新 | `src/lib/insights.ts`（JST 関数を `lib/date.ts` から参照） |

### 各 actions ファイルの担当関数

**restaurant.ts**（`"use server"` 宣言必須）
- `createRestaurant()`
- `updateRestaurant()`
- `deleteRestaurant()`
- `reorderRestaurants()`
- `getOrCreateSnapshotRestaurant()`

**menu-item.ts**（`"use server"` 宣言必須）
- `createMenuItem()`
- `updateMenuItem()`
- `deleteMenuItem()`
- `reorderMenuItems()`
- `setMenuItemRank()`

**food-log.ts**（`"use server"` 宣言必須）
- `saveMealToLog()`
- `deleteFoodLogEntry()`
- `getFoodLogForDate()`
- `searchProductByBarcode()`

**favorites.ts**（`"use server"` 宣言必須）
- `fetchFavoriteGroupsPayloadInternal()`
- favorite group の CRUD・並び替え
- favorite entry の CRUD・並び替え

**import-export.ts**（`"use server"` 宣言必須）
- `importMenuFromJson()`
- `exportMenuAsJson()`
- QR ペイロード解析・生成のサーバー側処理

**settings.ts**（`"use server"` 宣言必須）
- `getUserSettings()`
- `updateUserSettings()`
- ダイエットフェーズ更新

### lib/ の新規ファイル

**lib/constants/meal.ts**
```typescript
// 現在 TodayClient.tsx と InsightsClient.tsx に重複している定数を集約
export const MEAL_LABELS: Record<MealType, string> = { ... }
export const MEAL_TYPES: MealType[] = [...]
export const MEAL_TAB_STYLES: Record<MealType, { ... }> = { ... }
```

**lib/date.ts**
```typescript
// 現在 insights.ts と header-hint.ts に分散している JST 日付ユーティリティを統合
export function toJstDateString(date?: Date): string { ... }
export function addDaysJst(dateStr: string, n: number): string { ... }
export function getTokyoHourMinute(): { hour: number; minute: number } { ... }
export function eachDate(start: string, end: string): string[] { ... }
```

### 確認事項
- `TodayClient.tsx` の import パスが全て更新されていること
- `"use server"` ディレクティブが各 actions ファイルの先頭にあること
- バレル（index.ts）を作らないこと
- `npm run build` でエラーなし

---

## Ph-1b: `lib/pfc.ts` 新設

### 方針

`CartEntry`（カート）と `FoodLogEntry`（DB記録）は型が異なるため、単純統合は避ける。**純粋な数値計算のみ**を担い、型変換は呼び出し元に残す。

```typescript
// lib/pfc.ts
export interface PfcValues {
  protein: number;
  fat: number;
  carbs: number;
}

export interface PfcTotal extends PfcValues {}

export function sumPfc(items: PfcValues[]): PfcTotal {
  return items.reduce(
    (acc, item) => ({
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs,
    }),
    { protein: 0, fat: 0, carbs: 0 }
  );
}
```

呼び出し元での型変換例:
```typescript
// TodayClient.tsx 側
const total = sumPfc(cartEntries.map(e => ({ protein: e.protein * e.qty, fat: e.fat * e.qty, carbs: e.carbs * e.qty })));

// insights.ts 側
const total = sumPfc(logEntries.map(e => ({ protein: e.protein, fat: e.fat, carbs: e.carbs })));
```

---

## Ph-1.5: Vitest セットアップ + ユニットテスト

### セットアップ手順

1. `vitest` + `@vitest/coverage-v8` をインストール
2. `vitest.config.ts` を作成（`tsconfig.json` のパスエイリアス `@/*` を解決する設定を含む）
3. `package.json` に `"test": "vitest"` スクリプトを追加

### テスト対象ファイル（Mock 不要な pure functions）

| テストファイル | 対象 |
|---|---|
| `src/lib/semver-compare.test.ts` | `semverCompare()` |
| `src/lib/pfc.test.ts` | `sumPfc()` |
| `src/lib/meal-timezone.test.ts` | `getMealTypeForTimeZone()` |
| `src/lib/menu-item-sort.test.ts` | `compareMenuItemsForListOrder()` |
| `src/lib/date.test.ts` | `toJstDateString()`, `addDaysJst()`, `eachDate()` |

---

## Ph-2 設計: TodayClient 状態フロー設計ドキュメント

### 作成ファイル

`docs/plans/issue-213-today-state-design.md`

### 記述内容

- 現在の TodayClient.tsx にある全 `useState` のリスト
- 各 state の所有者（TodayClient に残すか、どの hook に移すか）
- コンポーネント間の props フロー図（テキスト形式で可）
- 各サブコンポーネントの props インターフェース（型定義案）

このドキュメントを確認・承認してから Ph-2a に着手する。

---

## Ph-2a〜2d: TodayClient 分割

### ターゲット構成

```
src/app/today/
├── _components/
│   ├── TodayClient.tsx        ← 300行程度に縮小
│   ├── PfcHeader.tsx          ← Ph-2a
│   ├── BarcodeScanner.tsx     ← Ph-2a
│   ├── CartPanel.tsx          ← Ph-2b
│   ├── MealTypeTabs.tsx       ← Ph-2b
│   ├── RestaurantPanel.tsx    ← Ph-2c
│   ├── MenuItemList.tsx       ← Ph-2c
│   ├── ItemDrawer.tsx         ← Ph-2d
│   └── FavoritesPanel.tsx     ← Ph-2d
└── _hooks/
    ├── useCart.ts             ← Ph-2b
    ├── useMealLog.ts          ← Ph-2b
    └── useRestaurantState.ts  ← Ph-2c
```

### 各フェーズの確認事項（共通）

- `npm run build` でエラーなし
- `/today` ページで手動操作（レストラン追加・メニュー追加・食事記録・お気に入り・QRスキャン・ドラッグ並び替え）が正常に動作すること

---

## Ph-3: パフォーマンス最適化

### 変更内容

**next.config.ts**
```typescript
optimizePackageImports: ['recharts', '@dnd-kit/core', '@dnd-kit/sortable'],
```

**SortableRestaurantTabs.tsx 内の dnd-kit import**
- トップレベルの `import { ... } from '@dnd-kit/...'` を `next/dynamic` に変更
- `RestaurantTabsLazy.tsx` の既存パターンに合わせる

**ItemDrawer.tsx**
```typescript
const ItemDrawer = dynamic(() => import('./_components/ItemDrawer'), { ssr: false });
```

### 検証

- `ANALYZE=true npm run build` で Bundle Analyzer を開き、クライアントバンドルサイズ減少を確認
- Chrome DevTools Network タブで初期ロード時間を計測（目標: 5秒 → 2秒以下）
