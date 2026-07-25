"use client";

import { useEffect, useState } from "react";
import type { MenuItem } from "@/types/database";
import type { MealType, PfcGrams } from "@ketolog/types";
import {
  decrementCount,
  formatCount,
  formatGramsShort,
  HALF_COUNT,
  incrementCount,
  isRemovableCount,
  toggleHalfCount,
  totalGramsForLine,
} from "@ketolog/domain/cart-serving";
import { MEAL_LABELS } from "@/lib/constants/meal";
import { HalfGramsButton } from "./HalfGramsButton";

/** カート内「記録する食事」セグメントの選択中スタイル（タブと同色） */
const MEAL_CART_SEGMENT_ACTIVE: Record<MealType, string> = {
  breakfast: "border-rose-400 bg-rose-500/25 text-rose-100",
  lunch: "border-cyan-400 bg-cyan-500/25 text-cyan-100",
  dinner: "border-violet-400 bg-violet-500/25 text-violet-100",
  snack: "border-teal-400 bg-teal-500/25 text-teal-100",
};

/** カートパネル外枠（選択中の食事タブと同系色の上線＋淡いグラデーション） */
const MEAL_CART_SHELL: Record<MealType, string> = {
  breakfast:
    "border-t-2 border-rose-400 bg-gradient-to-b from-rose-500/20 via-gray-900 to-gray-950",
  lunch:
    "border-t-2 border-cyan-400 bg-gradient-to-b from-cyan-500/20 via-gray-900 to-gray-950",
  dinner:
    "border-t-2 border-violet-400 bg-gradient-to-b from-violet-500/20 via-gray-900 to-gray-950",
  snack:
    "border-t-2 border-teal-400 bg-gradient-to-b from-teal-500/20 via-gray-900 to-gray-950",
};

export type CartEntry =
  | { kind: "menu"; item: MenuItem; count: number; gramsPerServing: number }
  | {
      kind: "snapshot";
      cartKey: string;
      name: string;
      protein_per_100g: number | null;
      fat_per_100g: number | null;
      carbs_per_100g: number | null;
      gramsPerServing: number;
      count: number;
      shared_barcode: string | null;
    };

function fmt(n: number) {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

function pfc(item: MenuItem, grams: number) {
  return {
    p: ((item.protein_per_100g ?? 0) * grams) / 100,
    f: ((item.fat_per_100g ?? 0) * grams) / 100,
    c: ((item.carbs_per_100g ?? 0) * grams) / 100,
  };
}

function pfcFromPer100(
  proteinPer100: number | null,
  fatPer100: number | null,
  carbsPer100: number | null,
  grams: number
) {
  return {
    p: ((proteinPer100 ?? 0) * grams) / 100,
    f: ((fatPer100 ?? 0) * grams) / 100,
    c: ((carbsPer100 ?? 0) * grams) / 100,
  };
}

function CartLineCountStepper({
  count,
  disabled,
  onDecrement,
  onIncrement,
  onToggleHalf,
}: {
  count: number;
  disabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onToggleHalf: () => void;
}) {
  const isHalf = count === HALF_COUNT;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label="回数を減らす"
        onClick={onDecrement}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm disabled:opacity-50 touch-manipulation"
      >
        −
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={isHalf ? "回数を1に戻す" : "回数を0.5にする"}
        title={isHalf ? "回数を1に戻す" : "回数を0.5にする"}
        onClick={onToggleHalf}
        className={`min-w-7 h-6 px-0.5 text-center text-xs font-bold tabular-nums rounded touch-manipulation disabled:opacity-50 ${
          isHalf
            ? "text-emerald-300 ring-1 ring-emerald-500/70"
            : "text-emerald-400"
        }`}
      >
        {formatCount(count)}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="回数を増やす"
        onClick={onIncrement}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm disabled:opacity-50 touch-manipulation"
      >
        +
      </button>
    </div>
  );
}

/** カート行の「1回あたり g」— ½ ショートカット＋数値入力 */
function CartLineGramsEditor({
  gramsPerServing,
  disabled,
  onCommit,
}: {
  gramsPerServing: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(formatGramsShort(gramsPerServing));
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setDraft(formatGramsShort(gramsPerServing));
  }, [gramsPerServing]);

  function commitDraft() {
    const n = Number.parseFloat(draft.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) {
      onCommit(n);
    } else {
      setDraft(formatGramsShort(gramsPerServing));
    }
  }

  function handleHalve(next: number) {
    onCommit(next);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 400);
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <HalfGramsButton
        value={gramsPerServing}
        disabled={disabled}
        size="compact"
        onHalve={handleHalve}
      />
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (v === "") return;
            const n = Number.parseFloat(v);
            if (Number.isFinite(n) && n > 0) {
              onCommit(n);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={`w-[3.25rem] sm:w-14 text-center text-xs sm:text-sm bg-gray-800 border rounded px-0.5 py-1 text-white tabular-nums shrink-0 transition-colors ${
            flash ? "border-emerald-400" : "border-emerald-600/80"
          }`}
          aria-label="1回あたりのグラム数"
        />
        <span className="text-[10px] text-gray-500">g</span>
      </div>
    </div>
  );
}

function CartBarHeader({
  cartExpanded,
  onToggle,
  cartEntryCount,
  onClearAll,
  clearingDisabled,
}: {
  cartExpanded: boolean;
  onToggle: () => void;
  cartEntryCount: number;
  onClearAll: () => void;
  clearingDisabled: boolean;
}) {
  return (
    <div className="w-full flex items-center justify-between gap-2 px-4 py-3.5 sm:py-2.5 min-h-12 sm:min-h-0">
      <button
        type="button"
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
      >
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-base sm:text-sm font-medium text-white">
          カート（{cartEntryCount}品）
        </span>
      </div>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onClearAll}
          disabled={clearingDisabled}
          className="px-2 py-1 rounded-md border border-gray-700 bg-gray-900/70 text-[11px] font-semibold text-gray-300 hover:text-white disabled:opacity-50"
        >
          🗑 空にする
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="text-gray-400 text-sm sm:text-xs px-1.5 py-1 rounded-md hover:bg-gray-800/70"
          aria-label={cartExpanded ? "カートを閉じる" : "カートを開く"}
        >
          {cartExpanded ? "▼" : "▲"}
        </button>
      </div>
    </div>
  );
}

function CartExpandedBody({
  mealType,
  setMealType,
  cartEntries,
  cartPFC,
  removeCartLine,
  onUpdateGramsPerServing,
  onChangeCount,
  onSave,
  saving,
  layout = "inline",
}: {
  mealType: MealType;
  setMealType: (t: MealType) => void;
  cartEntries: CartEntry[];
  cartPFC: PfcGrams;
  removeCartLine: (key: string) => void;
  onUpdateGramsPerServing: (lineKey: string, grams: number) => void;
  onChangeCount: (lineKey: string, count: number) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  /** モバイルのオーバーレイでは一覧を縦に伸ばす */
  layout?: "inline" | "sheet";
}) {
  const listScrollClass =
    layout === "sheet"
      ? "min-h-0 flex-1 overflow-y-auto border-t border-gray-800/70"
      : "max-h-36 overflow-y-auto border-t border-gray-800/70";
  return (
    <>
      <div className="px-3 pt-1 pb-2 border-t border-gray-800/70">
        <div className="flex gap-1">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMealType(t)}
              className={`flex-1 min-h-10 min-w-0 px-0.5 py-2 rounded-lg text-[10px] sm:text-xs font-medium border-2 transition-colors touch-manipulation ${
                mealType === t
                  ? MEAL_CART_SEGMENT_ACTIVE[t]
                  : "border-gray-700/90 bg-gray-800/70 text-gray-500 hover:text-gray-300 hover:border-gray-600"
              }`}
            >
              {MEAL_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className={listScrollClass}>
        {cartEntries.map((entry) => {
          const totalGrams = totalGramsForLine(entry);
          const v =
            entry.kind === "menu"
              ? pfc(entry.item, totalGrams)
              : pfcFromPer100(
                  entry.protein_per_100g,
                  entry.fat_per_100g,
                  entry.carbs_per_100g,
                  totalGrams
                );
          const lineKey = entry.kind === "menu" ? entry.item.id : entry.cartKey;
          const title = entry.kind === "menu" ? entry.item.name : entry.name;
          const snapshotTag =
            entry.kind === "snapshot" ? (
              <span className="text-gray-600 ml-1 text-[10px] shrink-0">
                スナップショット
              </span>
            ) : null;
          return (
            <div
              key={lineKey}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 border-b border-gray-800/50"
            >
              <span className="text-sm text-gray-200 truncate flex-1 min-w-[8rem]">
                {title}
                {snapshotTag}
              </span>
              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                P{fmt(v.p)} F{fmt(v.f)} C{fmt(v.c)}
              </span>
              <CartLineCountStepper
                count={entry.count}
                disabled={saving}
                onDecrement={() => {
                  const next = decrementCount(entry.count);
                  if (isRemovableCount(next)) removeCartLine(lineKey);
                  else onChangeCount(lineKey, next);
                }}
                onIncrement={() => onChangeCount(lineKey, incrementCount(entry.count))}
                onToggleHalf={() => onChangeCount(lineKey, toggleHalfCount(entry.count))}
              />
              <CartLineGramsEditor
                gramsPerServing={entry.gramsPerServing}
                disabled={saving}
                onCommit={(g) => onUpdateGramsPerServing(lineKey, g)}
              />
              <button
                type="button"
                aria-label="カートから外す"
                onClick={() => removeCartLine(lineKey)}
                className="shrink-0 min-w-9 min-h-9 sm:min-w-8 sm:min-h-8 flex items-center justify-center text-gray-500 hover:text-white text-lg leading-none touch-manipulation rounded-lg active:bg-gray-800/60"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3.5 sm:py-3 flex items-center justify-between gap-3 flex-none border-t border-gray-800/70">
        <div className="text-base sm:text-sm text-gray-300 tabular-nums min-w-0">
          合計 P<span className="text-white font-medium">{fmt(cartPFC.p)}</span>{" "}
          F<span className="text-white font-medium">{fmt(cartPFC.f)}</span>{" "}
          C<span className="text-white font-medium">{fmt(cartPFC.c)}</span>g
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="px-5 py-3 sm:px-4 sm:py-2 min-h-11 sm:min-h-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-base sm:text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          {saving ? "記録中..." : "記録する"}
        </button>
      </div>
    </>
  );
}

export type CartPanelProps = {
  mealType: MealType;
  onMealTypeChange: (m: MealType) => void;
  cartExpanded: boolean;
  onCartExpandedChange: (open: boolean) => void;
  cartEntries: CartEntry[];
  cartPfc: PfcGrams;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onClearAll: () => void;
  onRemoveCartLine: (mapKey: string) => void;
  onUpdateGramsPerServing: (lineKey: string, grams: number) => void;
  onChangeCount: (lineKey: string, count: number) => void;
};

export function CartPanel({
  mealType,
  onMealTypeChange,
  cartExpanded,
  onCartExpandedChange,
  cartEntries,
  cartPfc,
  saving,
  onSave,
  onClearAll,
  onRemoveCartLine,
  onUpdateGramsPerServing,
  onChangeCount,
}: CartPanelProps) {
  if (cartEntries.length === 0) return null;

  const bodyProps = {
    mealType,
    setMealType: onMealTypeChange,
    cartEntries,
    cartPFC: cartPfc,
    removeCartLine: onRemoveCartLine,
    onUpdateGramsPerServing,
    onChangeCount,
    onSave,
    saving,
  };

  return (
    <>
      <div
        className={`sm:hidden flex-none pb-[env(safe-area-inset-bottom)] ${MEAL_CART_SHELL[mealType]} ${cartExpanded ? "hidden" : ""}`}
      >
        <CartBarHeader
          cartExpanded={cartExpanded}
          onToggle={() => onCartExpandedChange(!cartExpanded)}
          cartEntryCount={cartEntries.length}
          onClearAll={onClearAll}
          clearingDisabled={saving}
        />
      </div>

      {cartExpanded && (
        <div
          className="sm:hidden fixed inset-0 z-[38] flex flex-col justify-end pointer-events-none"
          role="dialog"
          aria-modal="true"
          aria-label="カートの詳細"
        >
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 border-0 bg-black/50"
            aria-label="カートを閉じる"
            onClick={() => onCartExpandedChange(false)}
          />
          <div
            className={`pointer-events-auto relative z-[1] flex max-h-[min(85svh,560px)] flex-col rounded-t-2xl border-x border-t border-gray-700 ${MEAL_CART_SHELL[mealType]} pb-[env(safe-area-inset-bottom)] max-w-md mx-auto w-full min-h-0`}
          >
            <div className="flex-none flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-600" aria-hidden />
            </div>
            <CartBarHeader
              cartExpanded={cartExpanded}
              onToggle={() => onCartExpandedChange(!cartExpanded)}
              cartEntryCount={cartEntries.length}
              onClearAll={onClearAll}
              clearingDisabled={saving}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CartExpandedBody layout="sheet" {...bodyProps} />
            </div>
          </div>
        </div>
      )}

      <div
        className={`hidden sm:flex sm:flex-none sm:flex-col sm:pb-[env(safe-area-inset-bottom)] ${MEAL_CART_SHELL[mealType]}`}
      >
        <CartBarHeader
          cartExpanded={cartExpanded}
          onToggle={() => onCartExpandedChange(!cartExpanded)}
          cartEntryCount={cartEntries.length}
          onClearAll={onClearAll}
          clearingDisabled={saving}
        />
        {cartExpanded && <CartExpandedBody {...bodyProps} />}
      </div>
    </>
  );
}
