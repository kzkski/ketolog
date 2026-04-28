"use client";

import { useEffect, useState } from "react";
import type { MenuItem } from "@/types/database";
import type { MealType, PfcGrams } from "@ketolog/types";
import { MEAL_LABELS } from "@/lib/constants/meal";

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

/** カート行の「1回あたり g」— 数値入力とブラウザ標準の step スピナー（1g 単位）に任せる */
function CartLineGramsEditor({
  gramsPerServing,
  disabled,
  onCommit,
}: {
  gramsPerServing: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(gramsPerServing));
  useEffect(() => {
    setDraft(String(gramsPerServing));
  }, [gramsPerServing]);

  function commitDraft() {
    const n = Number.parseFloat(draft.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) {
      onCommit(n);
    } else {
      setDraft(String(gramsPerServing));
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      <span className="text-[9px] text-gray-500 leading-none">1回</span>
      <input
        type="number"
        min={1}
        step={1}
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
        className="w-[3.75rem] sm:w-16 text-center text-xs sm:text-sm bg-gray-800 border border-emerald-600/80 rounded px-0.5 py-1 text-white tabular-nums shrink-0"
        aria-label="1回あたりのグラム数"
      />
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
          const totalGrams = entry.gramsPerServing * entry.count;
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
              className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-1.5 border-b border-gray-800/50"
            >
              <span className="text-sm text-gray-200 truncate flex-1 min-w-[10rem]">
                {title}
                {snapshotTag}
                <span className="text-gray-500 ml-1 text-xs whitespace-nowrap">
                  ×{entry.count}（{totalGrams}g）
                </span>
              </span>
              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                P{fmt(v.p)} F{fmt(v.f)} C{fmt(v.c)}
              </span>
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
}: CartPanelProps) {
  if (cartEntries.length === 0) return null;

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
              <CartExpandedBody
                layout="sheet"
                mealType={mealType}
                setMealType={onMealTypeChange}
                cartEntries={cartEntries}
                cartPFC={cartPfc}
                removeCartLine={onRemoveCartLine}
                onUpdateGramsPerServing={onUpdateGramsPerServing}
                onSave={onSave}
                saving={saving}
              />
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
        {cartExpanded && (
          <CartExpandedBody
            mealType={mealType}
            setMealType={onMealTypeChange}
            cartEntries={cartEntries}
            cartPFC={cartPfc}
            removeCartLine={onRemoveCartLine}
            onUpdateGramsPerServing={onUpdateGramsPerServing}
            onSave={onSave}
            saving={saving}
          />
        )}
      </div>
    </>
  );
}
