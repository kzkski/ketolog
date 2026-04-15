"use client";

import { useRef, useState } from "react";
import type { MenuItem } from "@/types/database";
import {
  MACRO_MENU_TEXT,
  menuRowMacroHighlights,
  type MacroHighlightTargets,
} from "@/lib/macroHighlights";
import type { CartEntry } from "./CartPanel";

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

const RANK_ICON: Record<number, { icon: string; className: string }> = {
  1: { icon: "◎", className: "text-emerald-400" },
  2: { icon: "○", className: "text-gray-500" },
  3: { icon: "△", className: "text-amber-400" },
  4: { icon: "✕", className: "text-red-400" },
};

export function MenuItemRow({
  item,
  entry,
  onAdd,
  onRemove,
  onChangeGrams,
  onEdit,
  onToggleFavorite,
  isFavorited,
  originCaption,
  pfcTargets,
}: {
  item: MenuItem;
  entry: CartEntry | undefined;
  onAdd: (grams: number) => void;
  onRemove: () => void;
  onChangeGrams: (g: number) => void;
  onEdit: () => void;
  onToggleFavorite: () => void | Promise<void>;
  isFavorited: boolean;
  originCaption?: string | null;
  pfcTargets: MacroHighlightTargets;
}) {
  const [editingGrams, setEditingGrams] = useState(false);
  const [gramsInput, setGramsInput] = useState("");
  const [localGrams, setLocalGrams] = useState(item.default_grams);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayGrams = entry?.gramsPerServing ?? localGrams;
  const serving = pfc(item, displayGrams);
  const count = entry?.count ?? 0;
  const rank = RANK_ICON[item.rank] ?? RANK_ICON[2];
  const { highlightP, highlightF } =
    item.protein_per_100g !== null
      ? menuRowMacroHighlights(serving, item, pfcTargets)
      : { highlightP: false, highlightF: false };

  const menuItemPfcLine =
    item.protein_per_100g !== null ? (
      <>
        <span className={highlightP ? MACRO_MENU_TEXT.p : "text-gray-500"}>P{fmt(serving.p)}</span>{" "}
        <span className={highlightF ? MACRO_MENU_TEXT.f : "text-gray-500"}>F{fmt(serving.f)}</span>{" "}
        <span className="text-gray-500">C{fmt(serving.c)}</span>
      </>
    ) : (
      <span className="text-gray-500">PFC未設定 — タップして編集</span>
    );

  function startGramsEdit() {
    setGramsInput(displayGrams.toString());
    setEditingGrams(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitGramsEdit() {
    const val = parseFloat(gramsInput);
    if (!isNaN(val) && val > 0) {
      if (entry) {
        onChangeGrams(val);
      } else {
        setLocalGrams(val);
      }
    }
    setEditingGrams(false);
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2.5 border-b border-gray-800/60">
      <button
        type="button"
        aria-label={isFavorited ? "お気に入りを解除" : "お気に入りに追加"}
        onClick={(e) => {
          e.stopPropagation();
          void onToggleFavorite();
        }}
        className={`shrink-0 w-8 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-base leading-none rounded-lg sm:rounded-md active:bg-gray-800/70 touch-manipulation ${
          isFavorited ? "text-amber-400" : "text-gray-600 hover:text-gray-400"
        }`}
      >
        {isFavorited ? "★" : "☆"}
      </button>
      <span className={`text-[11px] sm:text-xs shrink-0 w-3.5 sm:w-4 flex justify-center ${rank.className}`}>{rank.icon}</span>
      <button type="button" className="flex-1 min-w-0 text-left py-0.5 -my-0.5" onClick={onEdit}>
        <p className="text-xs sm:text-sm text-white truncate leading-snug">{item.name}</p>
        {originCaption ? (
          <>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate leading-snug">{originCaption}</p>
            <p className="text-[11px] sm:text-xs mt-0.5 tabular-nums leading-snug">{menuItemPfcLine}</p>
          </>
        ) : (
          <p className="text-[11px] sm:text-xs mt-0.5 tabular-nums leading-snug">{menuItemPfcLine}</p>
        )}
      </button>

      <div className="shrink-0">
        {editingGrams ? (
          <input
            ref={inputRef}
            type="number"
            value={gramsInput}
            onChange={(e) => setGramsInput(e.target.value)}
            onBlur={commitGramsEdit}
            onKeyDown={(e) => e.key === "Enter" && commitGramsEdit()}
            className="w-[3.5rem] sm:w-14 text-center text-xs sm:text-sm bg-gray-800 border border-emerald-500 rounded px-0.5 py-0.5 sm:py-0.5 text-white"
          />
        ) : (
          <button
            type="button"
            onClick={startGramsEdit}
            className="text-[11px] sm:text-xs text-gray-400 hover:text-white transition-colors min-h-7 min-w-7 sm:min-h-0 sm:min-w-0 px-0.5 py-0.5 rounded-md sm:rounded-none active:bg-gray-800/80 tabular-nums"
          >
            {displayGrams}g
          </button>
        )}
      </div>

      {count === 0 ? (
        <button
          type="button"
          onClick={() => onAdd(displayGrams)}
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-base sm:text-lg font-bold shrink-0"
        >
          +
        </button>
      ) : (
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={onRemove}
            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm sm:text-base"
          >
            −
          </button>
          <span className="w-4 sm:w-5 text-center text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">{count}</span>
          <button
            type="button"
            onClick={() => onAdd(displayGrams)}
            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm sm:text-base"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
