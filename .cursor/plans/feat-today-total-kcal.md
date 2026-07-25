# 実装計画: Today画面に総摂取カロリー（kcal）を表示

- Issue: [kzkski/ketolog#342](https://github.com/kzkski/ketolog/issues/342)
- 対象ブランチ種別: `feat/`（マイナーバージョンアップ対象）
- 想定ブランチ名: `feat/today-total-kcal`

---

## 1. Goal & Acceptance Criteria

### Goal

Today画面の PFC 進捗バー領域（P/F/C の3行）の**右側**に、表示中日付の「記録済み + カート内」PFC から算出した**総摂取カロリー（kcal）**を表示する。Web（`PfcHeader`）と iOS（`TodayScreen` の `pfcBlock`）で同一の UI 構成にする。**新しい行は増やさない。**

```
P ████░░░░  12 / 150g   ┌─────────┐
F ██░░░░░░   8 /  70g   │  1234   │
C █░░░░░░░   5 /  50g   │  kcal   │
                        └─────────┘
```

### Acceptance Criteria（Issue本文より）

- [ ] Web Today の PFC ブロック右側に、整数の総摂取 kcal が表示される
- [ ] iOS Today でも同じレイアウト・同じ計算結果で表示される
- [ ] 値は表示中日付の「記録 + カート」PFC から `pfcTotalKcal` で算出され、四捨五入される
- [ ] PFC バーの行数は増えていない（3行のまま）
- [ ] カート追加・記録保存・日付切替で値が追随する
- [ ] `CHANGELOG.md` を更新する（ユーザー影響あり）

### スコープ外（Issueで明記）

- Insights（分析）画面の変更
- 目標カロリーの設定・表示（目標kcal・残り・達成率は出さない）
- DBスキーマ変更（保存用カロリー列の追加など）

---

## 2. 現状のコード（Current State）

### 2.1 Web: `src/app/today/_components/PfcHeader.tsx`

- `PfcBarRow`（同ファイル内、L14-43）が P/F/C 各1行を描画。`current / target`g の表示は行の右端（`w-[4.75rem] sm:w-[4.5rem]`）。
- 3行は下記コンテナに `space-y-1 sm:space-y-1.5` で縦並び（L196-215）:

```196:215:src/app/today/_components/PfcHeader.tsx
      <div className="flex-none px-3 sm:px-4 py-1.5 sm:py-3 bg-gray-900 border-b border-gray-800 space-y-1 sm:space-y-1.5">
        <PfcBarRow
          label="P"
          current={totalConsumed.p}
          target={proteinTargetG}
          color={MACRO_BAR_BG.p}
        />
        <PfcBarRow
          label="F"
          current={totalConsumed.f}
          target={fatTargetG}
          color={MACRO_BAR_BG.f}
        />
        <PfcBarRow
          label="C"
          current={totalConsumed.c}
          target={carbsTargetG}
          color={MACRO_BAR_BG.c}
        />
      </div>
```

- `PfcHeader` は既に `totalConsumed: PfcGrams`（`@ketolog/types` の `PfcGrams`）を props で受け取っている（L53, L82）。**kcal算出に必要なgramデータは既にこのコンポーネントに来ている。**
- 呼び出し元 `src/app/today/TodayClient.tsx`（L1742, L1782）で `totalConsumed={totalPFC}` を渡す。`totalPFC`（L1455-1462）は `sumPfc(consumedForDate, cartPFC)` = 「記録済み + カート内」で、Issueの要求する集計と一致（**追加の集計ロジックは不要**）。

### 2.2 Web: 色・スタイルの定義元

- `src/lib/macroHighlights.ts` の `MACRO_BAR_BG`（バー色）。
- 既存の枠付きバッジ的UIの参考実装: 同ファイル内フェーズ選択ボタン（L183-190）が `border-gray-700 bg-gray-800/60` などの配色を使用済み → 新規kcalボックスの配色として再利用する。

### 2.3 Mobile: `apps/mobile/screens/TodayScreen.tsx`

- `PfcBarRow`（同ファイル内、L108-141）がP/F/C各1行を `View`/`Text` で描画。値は `styles.pfcValue`（幅80、右揃え）。
- `consumed`（DBから取得した記録済みPFC, L152, L261-269）と `cartPfcTotal`（カート内合計, L277-288）を `pfcBarCurrent = sumPfc(consumed, cartPfcTotal)`（L291）で合算。Webの`totalPFC`と同じ考え方で「記録済み + カート内」。
- 表示箇所（L843-869）:

```843:869:apps/mobile/screens/TodayScreen.tsx
          <View
            style={styles.pfcBlock}
            accessibilityLabel={
              cartLinesSorted.length > 0
                ? "PFC（記録済みとカート内の合計）"
                : "PFC（記録済み）"
            }
          >
            <PfcBarRow
              label="P"
              current={pfcBarCurrent.p}
              target={activeProfile.protein_target_g}
              color={COLORS.p}
            />
            <PfcBarRow
              label="F"
              current={pfcBarCurrent.f}
              target={activeProfile.fat_target_g}
              color={COLORS.f}
            />
            <PfcBarRow
              label="C"
              current={pfcBarCurrent.c}
              target={activeProfile.carbs_target_g}
              color={COLORS.c}
            />
          </View>
```

- 現在の `pfcBlock` スタイル（L1300-1332）は**縦方向コンテナ**（`flexDirection` 未指定＝デフォルト`"column"`）で、`gap: 6` が3行間の間隔を担っている。3行は横並びに変更**しない**（各行内部は既に `flexDirection: "row"`）。

### 2.4 Domain: `packages/domain/src/pfc.ts`

- `pfcTotalKcal(grams: PfcGrams): number`（L60-63）が既存。内部で `pfcKcal`（P×4, F×9, C×4 = `KCAL_PER_G_PROTEIN/FAT/CARBS`）を使って合計。**これをそのまま利用し、新規換算ロジックは作らない。**
- サブパスインポート `@ketolog/domain/pfc` は Web/Mobile 双方で既に利用実績あり（`sumPfc`, `pfcGramsFromNullablePer100` など）→ `pfcTotalKcal` も同様にインポート可能。

### 2.5 テスト・E2E への影響確認

- `PfcHeader.tsx` / `TodayScreen.tsx` のUIに対するユニット・E2Eテストは存在しない（`packages/domain/src/pfc.test.ts` はドメイン関数のみを対象）。DOM構造変更によるテスト破損リスクは無い。

---

## 3. 提案するUI構造（DOM / View 階層）

**方針**: 「3行のバー列」と「kcal ボックス」を横並びにする**ラッパーを1つ追加**し、既存の3行（`space-y-*` / `gap`）はそのラッパーの中に押し込むだけ。行数は増えない。

### 3.1 Web（`PfcHeader.tsx`）— 提案DOM

```html
<div class="flex-none px-3 sm:px-4 py-1.5 sm:py-3 bg-gray-900 border-b border-gray-800">
  <div class="flex items-stretch gap-2 sm:gap-3">
    <div class="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
      <!-- PfcBarRow x3（既存そのまま） -->
    </div>
    <div
      role="group"
      aria-label="合計摂取 1234 kcal"
      class="flex min-w-14 sm:min-w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-gray-700 bg-gray-800/60 px-1"
    >
      <span aria-hidden="true" class="text-sm sm:text-base font-bold text-white tabular-nums leading-none whitespace-nowrap">1234</span>
      <span aria-hidden="true" class="text-[10px] text-gray-400 leading-none">kcal</span>
    </div>
  </div>
</div>
```

- 外側の `div`（旧: バー3行を直接内包していたコンテナ）から `space-y-*` を除去し、新設の `flex items-stretch` 行コンテナに置き換える。
- `items-stretch` により kcal ボックスの高さが「3行ぶん」（バー3行 + 行間ギャップの合計高さ）と自動的に一致する。**固定 height 指定は不要**（Issueの ASCII 図の「3行の高さを使う」を、明示的な高さ計算なしで実現できる）。
- kcalボックスは `min-w-*`（固定 `w-*` ではなく）にして、桁数が増えても折れ返らず自然に幅が広がるようにする（→ §12 リスク参照）。

### 3.2 Mobile（`TodayScreen.tsx`）— 提案View階層

```tsx
<View
  style={styles.pfcBlock}
  accessible
  accessibilityLabel={
    cartLinesSorted.length > 0
      ? `PFC（記録済みとカート内の合計）。合計摂取 ${totalKcal} kcal`
      : `PFC（記録済み）。合計摂取 ${totalKcal} kcal`
  }
>
  <View style={styles.pfcRows}>
    {/* PfcBarRow x3（既存そのまま） */}
  </View>
  <View style={styles.kcalBox} accessible={false}>
    <Text style={styles.kcalValue} numberOfLines={1}>{totalKcal}</Text>
    <Text style={styles.kcalUnit}>kcal</Text>
  </View>
</View>
```

- `pfcBlock` を `flexDirection: "row"` に変更し、右側に `kcalBox` を追加。
- 3行ぶんの縦積みは新設の `pfcRows`（`flex: 1`, 元 `pfcBlock` にあった `gap: 6` をこちらに移す）に肩代わりさせる。
- `pfcBlock` に `alignItems: "stretch"`（デフォルトのため実質不要だが明示）を付け、`kcalBox` が `pfcRows` と同じ高さに引き伸ばされるようにする（Webの `items-stretch` と同じ効果）。
- アクセシビリティの入れ子方針（詳細は §9）: `pfcBlock` の `accessibilityLabel` に kcal文言を含めて**1つの読み上げ要素に統合**し、`kcalBox` は `accessible={false}` にして個別要素化させない（VoiceOverでの二重読み上げを防止）。

### 3.3 高さを揃える仕組み（Web/Mobile共通の考え方）

- 明示的な `height` 計算は行わない。Flexboxの `align-items: stretch`（Web）/ `alignItems: "stretch"`（RN、デフォルト）により、kcalボックスは自動的に「3行分の高さ」に伸びる。これがWeb/Mobileで実装方法が一致する最大のポイント。

---

## 4. データフロー（`pfcTotalKcal` の呼び出し場所）

### 4.1 Web

- **呼び出し場所**: `PfcHeader.tsx` 内部（`TodayClient.tsx` は変更不要）。
- 理由: `PfcHeader` は既に `totalConsumed: PfcGrams` を props で受け取っており、それは Issue が要求する「記録済み + カート内」の合計そのもの。新しい prop を追加せず、コンポーネント内部で `pfcTotalKcal(totalConsumed)` を計算する。
- 追加インポート: `import { pfcTotalKcal } from "@ketolog/domain/pfc";`
- 計算: `const totalKcal = Math.round(pfcTotalKcal(totalConsumed));`（コンポーネント関数本体の先頭、他のフックの近く。React純関数コンポーネントでmemo化の必要はない軽量計算）。

### 4.2 Mobile

- **呼び出し場所**: `TodayScreen.tsx` 内、既存の `pfcBarCurrent`（`consumed` + `cartPfcTotal` の合計）の定義直後。
- 追加インポート: 既存の `import { pfcGramsFromNullablePer100, sumPfc, type PfcGrams } from "@ketolog/domain/pfc";` に `pfcTotalKcal` を追加。
- 計算: **Webと同様にインライン計算にする（`useMemo` は使わない）**。

```ts
const totalKcal = Math.round(pfcTotalKcal(pfcBarCurrent));
```

- `Math.round(pfcTotalKcal(...))` は加算3回・乗算3回程度の非常に軽い計算であり、`useMemo` でメモ化するコストの方が大きい。`pfcBarCurrent` 自体は既存の `useMemo` で日付切替・カート変更に追随して再計算される値なので、`totalKcal` をその都度インラインで再計算しても実質的なコストは無視できる（レンダーごとに軽量な算術を1回行うだけ）。リポジトリ内で不要な `useMemo` を増やさない方針に合わせる。

### 4.3 Propsの追加・変更なし

- Web: `PfcHeaderProps` に新しいpropは**追加しない**（`totalConsumed` から内部で導出）。
- Mobile: `TodayScreen` はそもそも単一ファイル内でJSXを組み立てているため、propsの受け渡し自体が発生しない。

---

## 5. ファイル別変更一覧

### 5.1 変更（Modify）

| ファイル | 変更内容 |
|---|---|
| `src/app/today/_components/PfcHeader.tsx` | `pfcTotalKcal` インポート追加、`totalKcal` 算出、PFCバー3行コンテナを `flex` ラッパーで包み kcal ボックスを追加 |
| `apps/mobile/screens/TodayScreen.tsx` | `pfcTotalKcal` インポート追加、`totalKcal` をインライン計算（`useMemo` は使わない）、`pfcBlock` のJSXを row構成に変更（`accessibilityLabel` にkcal文言を統合、`kcalBox` は `accessible={false}`）、`StyleSheet` に `pfcRows` / `kcalBox` / `kcalValue` / `kcalUnit` を追加、既存 `pfcBlock` から `gap: 6` を除去して `flexDirection: "row"` 用のギャップに変更 |
| `package.json`（ルート） | `version` を実装着手時点の現行値からマイナー1つ上げる（本計画作成時点では `1.67.0` → `1.68.0` を想定。§10参照） |
| `CHANGELOG.md` | 本機能のエントリのみを `## [Unreleased]` から新規バージョン見出しへ移す形で追加。**既存の無関係なUnreleasedエントリ（`daily_log` 修正）はUnreleasedに残す**（詳細は §10） |

### 5.2 新規作成（Create）

- 新規ファイルは不要（既存ファイルへの追記のみ）。
  - Web: kcalボックスは `PfcHeader.tsx` 内にインライン、または同ファイル内に小さな `KcalBadge` サブコンポーネントとして切り出す（`PfcBarRow` と同じファイル内パターンを踏襲、既存の配置規約上も同ページ専用UIなので `_components/` 内で完結させて問題ない）。
  - Mobile: 同様に `TodayScreen.tsx` 内にインラインJSXとして実装（既存の `PfcBarRow` もこのファイル内に定義されており一貫性がある）。

### 5.3 削除（Delete）

- 無し。

---

## 6. 共有パッケージ vs プラットフォーム個別の判断

- **UIコンポーネント自体は共有パッケージ化しない**。現状 `packages/domain` はUIに依存しない純粋ロジックのみを置く方針（`AGENTS.md` 参照）であり、React（DOM）と React Native（View/Text）はレンダリング先が異なるため、UIをそのまま共有することはできない。
- **計算ロジック（`pfcTotalKcal` と四捨五入）は既に共有済み** (`packages/domain/src/pfc.ts`)。今回追加するのは「その結果を表示するだけ」の薄いUIであり、Web/Mobile合わせて追加コードは十数行程度。新しい共有UIパッケージ（例: `packages/ui`）を作るほどの複雑性・再利用性はなく、既存方針を変える正当な理由がないため、**現状維持**（UI非共有）で進める。
- 将来的にPFCバー全体をUIレベルで共有する話が出た場合は別Issueで検討する（本Issueのスコープ外）。

---

## 7. スタイリング方針（Web ↔ Mobile 見た目パリティ）

Web（Tailwind）と Mobile（`StyleSheet`）で使う値を対応づける。既存のダークテーマ配色（`border-gray-700` = `#374151`, `bg-gray-800/60` = `rgba(31,41,55,0.6)`）を新規に定義せず流用する。

| 項目 | Web (Tailwind) | Mobile (StyleSheet) | 備考 |
|---|---|---|---|
| ボックス背景 | `bg-gray-800/60` | `backgroundColor: "rgba(31,41,55,0.6)"` | 既存フェーズボタンと同じトーン |
| ボックス枠線 | `border border-gray-700` | `borderWidth: 1, borderColor: "#374151"` | 既存フェーズボタンの非選択枠と同じ |
| 角丸 | `rounded-lg`（8px） | `borderRadius: 8` | |
| 幅 | `min-w-14`（56px, 既定） / `sm:min-w-16`（64px, ≥640px） | `minWidth: 56` | モバイル実機は常に狭いビューポート相当なので、Webの`sm:`未満（デフォルト56px）に合わせる |
| 内側パディング | `px-1` | `paddingHorizontal: 4` | |
| 縦配置 | `items-stretch`（親） | `alignItems: "stretch"`（親、RNデフォルト） | 3行と同じ高さに自動追随 |
| 内部レイアウト | `flex flex-col items-center justify-center gap-0.5` | `alignItems: "center", justifyContent: "center", gap: 2` | |
| 数値フォント | `text-sm sm:text-base font-bold text-white tabular-nums leading-none whitespace-nowrap` | `fontSize: 15, fontWeight: "700", color: "#ffffff", fontVariant: ["tabular-nums"]` | 既存 `pfcValue` は `text-gray-300`系だが、kcal値は既存バー行の値より少し目立たせて主要情報として強調（Issueの枠付きボックスの意図に合わせる） |
| 単位ラベル | `text-[10px] text-gray-400 leading-none` | `fontSize: 10, color: COLORS.textMuted, marginTop: 2` | 小文字 `kcal` 固定表記 |
| 行との間隔（横） | `gap-2 sm:gap-3`（親フレックス） | `gap: 10`（`pfcBlock`） | |
| 行同士の間隔（縦、既存） | `space-y-1 sm:space-y-1.5` → `pfcRows` 内で維持 | `gap: 6`（`pfcRows`に移設） | 既存の3行間隔は変更しない |

- ダークテーマの新規カラー追加は不要（既存トークンの再利用のみ）。
- フォントの `tabular-nums` は既存のgram値表示でも使われているパターンを継承（桁が変わってもガタつかない）。

### 7.1 枠の強さ・トーン（控えめにする）

- 既存のPFCストリップ（バー3行）には枠付きのサブボックスは元々存在しない。Issue ASCII図の枠は「列」であることを示す概念図であり、**強いカードUIを必須とするものではない**。
- 実装では以下を推奨する:
  - 背景・枠線は §7表のとおり既存フェーズボタン相当の**控えめな**トーン（`bg-gray-800/60` + `border-gray-700`）にとどめる。
  - `shadow`（box-shadow / RNの `shadow*`・`elevation`）は付けない。
  - 角丸も `rounded-lg`（8px）程度に留め、過度に大きい角丸やバッジ的な装飾（グラデーション等）は避ける。
  - 目的は「3行ぶんの高さを使った数値の縦積み」を視覚的にひとまとまりに見せることであり、装飾を目立たせることではない。

### 7.2 狭幅レイアウトのフォールバック方針

- 狭いビューポート（iPhone SE等）でバー列が窮屈になる場合に備え、次の優先順位でスタイルを調整できる余地を残す（実装時に実機/エミュレータで確認して判断）:
  1. 親フレックスの横 `gap`（Web: `gap-2 sm:gap-3` / Mobile: `gap: 10`）を詰める（例: `gap-1.5` / `gap: 8`）。
  2. kcalボックスの `min-w-14`（56px）/ `minWidth: 56` を `min-w-12`（48px）/ `minWidth: 48` 程度まで縮める。
  3. それでも窮屈な場合は、**枠線・背景を外し**「数値 + `kcal`」の縦積みテキストのみ（枠なしのコンパクト表示）にフォールバックすることを許容する。この場合でも `items-stretch` 等による3行分の高さ確保は維持し、レイアウト自体（横並び・行数）は変えない。
- どの段階まで適用するかは、実装時に実際のiPhone SE幅（375pt論理幅）での見た目を見て判断する（本計画では優先順位のみを規定し、最終形は実装時のビジュアル確認で確定させる）。

---

## 8. 四捨五入の扱い

- **合計してから四捨五入**する。個々のP/F/Cのkcalをそれぞれ四捨五入してから合算すると、既存の `pfcTotalKcal` の計算結果とズレる可能性があるため、必ず `Math.round(pfcTotalKcal(grams))` の順序で1回だけ丸める。
- Web: `const totalKcal = Math.round(pfcTotalKcal(totalConsumed));`
- Mobile: `const totalKcal = Math.round(pfcTotalKcal(pfcBarCurrent));`（インライン計算、`useMemo` は使わない。§4.2参照）
- 既存の `fmtMacroGrams`（各バーのg表示用）とは完全に独立した処理であり、既存関数の変更・共有は不要（gram表示は小数1桁 or 整数、kcalは常に整数四捨五入で表示ルールが異なる）。

---

## 9. アクセシビリティ（ラベル）

Issueには明示のARIA要件はないが、視覚情報のみで完結しないよう配慮する。**入れ子・二重読み上げを避けるため、Web / Mobileとも「1つの読み上げ単位にまとめる」方針で統一する。**

### Web

- kcalボックスのコンテナに `role="group"` + `aria-label="合計摂取 {totalKcal} kcal"` を付与。
- 内部の数値・単位の `<span>` にはそれぞれ `aria-hidden="true"` を付け、スクリーンリーダーが同じ情報を二重に読み上げないようにする（親の `aria-label` のみが読まれる）。
- ラベル文言例: `合計摂取 1234 kcal`。

### Mobile — 方針を確定（**オプションA**を採用）

Issueレビューで提示された2案のうち、**オプションA（推奨）を採用する**。理由: 現状の `pfcBlock` には既にPFC全体を指す `accessibilityLabel` があり、そこにkcal情報を統合する方がVoiceOverの読み上げ単位が1つに保たれ、行き先の異なる2つの `accessible` 要素が並存する状態（入れ子・二重読み上げのリスク）を避けられる。

- `pfcBlock`（`View`）に `accessible` を明示し、`accessibilityLabel` を既存の文言 + kcal文言を連結した1文にする:

  ```ts
  accessibilityLabel={
    cartLinesSorted.length > 0
      ? `PFC（記録済みとカート内の合計）。合計摂取 ${totalKcal} kcal`
      : `PFC（記録済み）。合計摂取 ${totalKcal} kcal`
  }
  ```

- `kcalBox`（`View`）には**独自の `accessibilityLabel` を付けない**。代わりに `accessible={false}` を指定し、`pfcBlock` の1要素に統合されるようにする（内部の `Text` 2つも個別要素として読み上げられない）。
- 既存の `PfcBarRow`（P/F/C各行）についても、`pfcBlock` が `accessible` な1要素として振る舞うことで、従来同様に個別の行がバラバラに読み上げられることはない（現状の挙動を維持するだけで、今回新たに壊すものはない）。
- Web側の文言「合計摂取 {totalKcal} kcal」とMobile側の文言（`。合計摂取 {totalKcal} kcal` として連結）の**トーン・言い回しを統一**し、プラットフォーム間で表現がバラつかないようにする。

---

## 10. バージョン管理・CHANGELOG・ブランチ命名（CONTRIBUTING.md準拠）

### ブランチ

- `feat/today-total-kcal`（`main` から作成）

### コミット構成（例）

1. `feat: Today画面のPFCバー右側に総摂取kcalを表示`（Web + Mobile実装）
2. `chore: バージョンを X.Y.Z に更新`（`package.json` のみ、単独コミット。`X.Y.Z` は実装着手時に確定した値。本計画時点の想定は `1.68.0`）
3. （必要であれば）`docs: CHANGELOGを更新`は上記1のコミットに含めて良い（CONTRIBUTING上は「`feat/`のPRはCHANGELOG更新必須」であり、独立コミットである必要はない）

### バージョン

- `feat/` のPR → マイナーを上げる。本計画作成時点の `package.json` の `version` は `1.67.0` のため、想定バンプ先は **`1.68.0`**。
- **注意（実装着手時に再確認）**: 本計画作成後、他のPRが先にマージされて `main` の `version` が既に上がっている可能性がある。実装着手時・PR作成時には `main` 最新化後の `package.json` の実際の `version` を確認し、そこからマイナーを1つ上げた値を使う（`1.68.0` は本計画時点の想定値であり、確定値ではない）。
- 対象は**ルート `package.json` のみ**。`apps/mobile/package.json` の `version`（`1.0.0`）はネイティブアプリのストアバージョン管理用で対象外・変更しない。

### CHANGELOG.md（重要: 移動対象は「本PRの変更」のみ）

- 現在の `## [Unreleased]` には、本Issueと**無関係な** `### Fixed`（`daily_log` の `security_invoker` 修正）が既に存在する。これは**別PRで発生した未リリースの変更**であり、本PRの変更ではない。
- CONTRIBUTINGのルール「バージョンを上げるPRでは、**そのPRがリリースするユーザー向け変更**を `[Unreleased]` から `[X.Y.Z]` に移す」は、あくまで**そのPRの変更に限定**される。無関係な既存Unreleasedエントリを一緒に版へ移すのは誤り。
- 正しい手順:
  1. `## [Unreleased]` の既存内容（`daily_log` の `Fixed` エントリ）は**そのままUnreleasedに残す**（触らない）。
  2. 本機能のエントリ（`### Added`）だけを新設の `## [X.Y.Z] - YYYY-MM-DD`（実装時に確定したバージョン番号）見出しの下に追加する。
  3. この新設の版見出しは `## [Unreleased]` の直後・既存の最新版見出しの直前に挿入する（既存の降順の並びを維持）。
- 新規エントリ例（`### Added`、新設の `## [X.Y.Z]` 配下）:

```md
## [1.68.0] - YYYY-MM-DD

### Added

- **Today**: PFC進捗バーの右側に、その日の総摂取カロリー（kcal）を表示（Web / iOS共通）。記録済み＋カート内のPFCから算出し、整数（四捨五入）で表示する。
```

- 見出し日付は実際にリリース（マージ）する日付を使う（プレースホルダーの日付は使わない。マージ日が確定してから確定させる）。
- バージョン番号（`X.Y.Z`）は上記「バージョン」節の注意のとおり、実装着手時に `package.json` の現行値から再算出した値を使う。
- CI（`require-changelog-version-heading`）は「`package.json` の `version` と同じ `## [X.Y.Z]` 見出しが `CHANGELOG.md` に存在すること」のみを検証するため、Unreleasedに無関係なエントリが残っていてもCIは失敗しない。ただしレビュー観点でも「Unreleasedには本PR未満の変更だけが残っている」ことを確認する。

---

## 11. テスト計画（手動チェックリスト）

### 共通（Web / iOS）

- [ ] 記録なし・カート空の状態で `0` kcal と表示される（0除算や `NaN` 表示にならない）
- [ ] 何か1品カートに入れると、保存前でも即座にkcal値が増える（バーと同時に反映）
- [ ] 記録を保存（カートから食事ログへ）した後もkcal値が変わらない（カート分＋記録分の合計として継続表示）
- [ ] 日付を前日・翌日に切り替えると、その日のPFCに対応したkcal値に変わる
- [ ] **手計算による検証**: 各バーに実際に渡っている生の `current`（`totalConsumed.p/f/c`〈Web〉または `pfcBarCurrent.p/f/c`〈Mobile〉。**画面に表示されている丸め済みの `fmtMacroGrams` の値ではない**）から `p*4 + f*9 + c*4` を計算し、それを四捨五入した値がkcal表示と一致することを確認する。
  - 補足: `fmtMacroGrams` は表示用に「10g未満は小数1桁、10g以上は整数」に丸めるため、その丸め後の値から逆算すると生のPFC合計から算出したkcalとズレる場合がある（例: 実際は `12.4g` だが表示は `12`）。検証時はブラウザの開発者ツールやReact Native Debuggerで実際のstate/変数値を確認するか、既知の入力データ（テスト用の食事ログ）を使って生の値を把握してから手計算する。
- [ ] PFCバーの行数が3行のまま増えていない
- [ ] kcalボックスの高さが3行分（バー3行＋行間）とおおよそ一致し、飛び出し・欠けが無い
- [ ] ダークテーマの配色（枠線・背景・文字色）が既存UI（フェーズ選択ボタンなど）と統一感がある

### Web個別

- [ ] デスクトップ幅（`sm:`以上）とスマホ幅（`sm:`未満、Chrome DevToolsのモバイルエミュレーションなど）の両方でレイアウト崩れがない
- [ ] 4桁（例: 1234）・5桁（例: 12000超、極端なテストデータ）の値でボックスからテキストが溢れない
- [ ] スクリーンリーダー（VoiceOver on macOS Safari 等）でkcalボックスが1つのグループとして「合計摂取 1234 kcal」のように読み上げられ、数値と単位が二重に読み上げられない

### iOS個別（シミュレータ or 実機）

- [ ] iPhone SE等の狭い画面幅でも、バー列とkcalボックスが横に収まりレイアウトが崩れない（テキストの折り返し・ボックスの潰れがない）。崩れる場合は §7.2 のフォールバック順序に従って調整する
- [ ] VoiceOverで `pfcBlock` 全体が1つの要素として「PFC（記録済み）。合計摂取 1234 kcal」（カートありの場合は「PFC（記録済みとカート内の合計）。合計摂取 1234 kcal」）のように読み上げられ、`kcalBox` やP/F/C各行が個別に・重複して読み上げられない
- [ ] カート追加でラベル文言が「PFC（記録済み）」→「PFC（記録済みとカート内の合計）」に切り替わり、kcal数値も追随する
- [ ] オフライン→オンライン復帰後の再送（outbox）反映時にも値が正しく追随する

### 自動テスト

- [ ] `npm run lint` / `npm run test`（Vitest, ドメイン層）が通る
- [ ] `npm run mobile:typecheck` が通る
- [ ] （既存に無いため）UIスナップショット等の新規テストは今回は追加しない（Issueスコープにテスト追加の要求なし。必要なら別途提案）

---

## 12. リスク・エッジケース

| ケース | リスク | 対応方針 |
|---|---|---|
| 0 kcal（未記録・カート空） | `NaN` や空文字にならないか | `pfcTotalKcal({p:0,f:0,c:0})` = `0` になるため `Math.round(0)` = `0`。特別分岐は不要、そのまま `0` と表示 |
| 非常に大きな数値（例: 暴食ログ、テストデータで10000kcal超） | 固定幅ボックスからテキストが溢れる／折り返る | 幅は `min-w-*`（Web）/ `minWidth`（Mobile）とし固定`width`にしない。数値側は `whitespace-nowrap`（Web）/ `numberOfLines={1}`（Mobile）で折り返し防止。極端な値でも横方向にボックスが伸びるだけでレイアウト崩壊しない |
| 狭いモバイル幅（iPhone SE等 375pt以下） | バー列（`flex:1`）とkcalボックス（`minWidth`固定）の合計がはみ出す | バー列側は元々 `flex-1`/`flex:1` で伸縮可能。kcalボックスは56px程度に抑え、既存のgram表示列（80px前後）より小さい幅に設定して余白を確保。実機/エミュレータで確認し、崩れる場合は §7.2 のフォールバック順序（① gap短縮 → ② `minWidth` 56→48 → ③ 枠なしのコンパクト表示）で対応する |
| カートが空 vs カートあり | 値が「記録済みのみ」か「記録済み+カート」で切り替わるべき | 既存の `totalPFC`（Web）/ `pfcBarCurrent`（Mobile）がどちらも「記録済み+カート」を常に合算する実装のため、kcalも自動的にPFCバーと同じ集計対象になる。追加の分岐は不要（既存ロジックに乗るだけ） |
| 日付切替中のローディング状態 | 古い日付の値が一瞬表示される／ちらつく | 既存のPFCバーと同じデータソース（`totalConsumed`/`pfcBarCurrent`）を使うため、既存のローディング挙動（`loadingDate` 中の表示）と完全に同期する。kcal専用のローディング処理は不要 |
| 小数第1位の丸め処理と既存gram表示 (`fmtMacroGrams`) の丸めルールの違い | 見た目の丸め方針が場所によって異なると誤解を招く可能性 | kcalは常に整数四捨五入固定である旨をコード上明示（コメントではなく、関数名・実装から自明にする）。Issue要件通り「目標・残り・達成率は出さない」ため単純表示に留める |
| ダークモード以外のテーマ | 現状Todayはダークテーマ固定（ライトモード非対応） | 既存同様、追加のテーマ分岐は不要 |
| アクセシビリティの二重読み上げ | 親に `aria-label`／`accessibilityLabel` を付けつつ子にテキストがあると重複読み上げされる恐れ | Web側は子要素（数値・単位の `<span>`）に `aria-hidden="true"` を明示。Mobile側は `pfcBlock` に `accessible` + 統合済みラベルを設定し、`kcalBox` は `accessible={false}` にして個別要素化させない（§9で方針確定・オプションA採用） |

---

## 13. 実装順序（ステップバイステップ）

1. `main` を最新化し、`feat/today-total-kcal` ブランチを作成する。
2. **Web実装**: `src/app/today/_components/PfcHeader.tsx`
   1. `import { pfcTotalKcal } from "@ketolog/domain/pfc";` を追加。
   2. `PfcHeader` 関数本体で `const totalKcal = Math.round(pfcTotalKcal(totalConsumed));` を計算。
   3. PFCバー3行のコンテナ（現行 L196-215）を、`flex items-stretch` の行コンテナで包み、既存3行を `flex-1` の列に、その右にkcalボックス（新設 `KcalBadge` サブコンポーネント、または直接JSX）を追加。
   4. kcalボックスに `role="group"` / `aria-label` / 子要素の `aria-hidden` を設定。
3. **Mobile実装**: `apps/mobile/screens/TodayScreen.tsx`
   1. 既存の `import { pfcGramsFromNullablePer100, sumPfc, type PfcGrams } from "@ketolog/domain/pfc";` に `pfcTotalKcal` を追加。
   2. `pfcBarCurrent` 定義の直後に `const totalKcal = Math.round(pfcTotalKcal(pfcBarCurrent));` を**インラインで**追加（`useMemo` は使わない。§4.2参照）。
   3. `pfcBlock` のJSX（L843-869）を、`pfcRows`（既存3行の `PfcBarRow`）と `kcalBox`（新設）の横並びに変更。同時に `pfcBlock` の `accessibilityLabel` にkcal文言を統合し、`kcalBox` に `accessible={false}` を設定する（§9のオプションA）。
   4. `StyleSheet.create` に `pfcRows` / `kcalBox` / `kcalValue` / `kcalUnit` を追加し、既存 `pfcBlock` の `gap: 6` を `pfcRows` に移設した上で `pfcBlock` を `flexDirection: "row"` に変更。
4. **見た目の確認**: `npm run dev` でWebをデスクトップ幅・モバイル幅の両方で目視確認。`npm run mobile:ios`（またはExpo Go/シミュレータ）でiOSを確認し、Web版と横並び構成・配色・フォントサイズを比較する。狭幅で崩れる場合は §7.2 のフォールバック順序で調整する。
5. **CHANGELOG更新**: `package.json` の現行 `version` を確認した上で、その次のマイナー版（本計画時点の想定は `1.68.0`）の見出し `## [X.Y.Z] - <マージ予定日>` を新設し、本機能の `### Added` エントリのみを追加する。**既存の `## [Unreleased]` にある無関係なエントリ（`daily_log` security_invoker修正など）はUnreleasedに残したまま変更しない**（§10参照）。
6. **バージョン更新コミット**: `package.json` の `version` を上記で確定した値に変更し、`chore: バージョンを X.Y.Z に更新` として単独コミット。
7. **検証**: `npm run lint`、`npm run test`、`npm run mobile:typecheck` を実行し全て通ることを確認。
8. §11のテスト計画に沿って手動確認（Web・iOS）を実施。
9. ブランチをpushし、`closes #342` を含むPRを作成（ラベル: `platform:web`, `platform:mobile`, `type:feature` 等、Issueのラベル運用に従う）。
10. レビュー後、通常マージ（`--admin` 等のバイパスは使わない）。マージ後にローカル・リモートの作業ブランチを削除する。

---

## 補足: 変更しないこと（念のための確認事項）

- `packages/domain/src/pfc.ts` の関数・定数は変更しない（既存の `pfcTotalKcal` をそのまま利用）。
- DBスキーマ・Server Actions・APIroutesへの変更は行わない（表示専用の集計値であり、永続化しない）。
- Insights画面・目標カロリー設定機能への変更は行わない。
- `TodayClient.tsx`（Web）はpropsの変更が不要なため、原則ノータッチ（`PfcHeader.tsx` 内部で完結）。
