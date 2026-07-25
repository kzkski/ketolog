"use client";

import {
  canHalveGrams,
  HALF_GRAMS_ARIA_LABEL,
  HALF_GRAMS_HINT,
  HALF_GRAMS_LABEL,
  HALF_GRAMS_LABEL_FULL,
  halveGrams,
} from "@ketolog/domain/cart-serving";

type HalfGramsButtonProps = {
  value: number;
  disabled?: boolean;
  size?: "compact" | "full";
  onHalve: (next: number) => void;
};

export function HalfGramsButton({
  value,
  disabled = false,
  size = "compact",
  onHalve,
}: HalfGramsButtonProps) {
  const blocked = disabled || !canHalveGrams(value);

  return (
    <button
      type="button"
      disabled={blocked}
      title={HALF_GRAMS_HINT}
      aria-label={HALF_GRAMS_ARIA_LABEL}
      onClick={() => onHalve(halveGrams(value))}
      className={
        size === "full"
          ? "shrink-0 min-h-11 px-3 rounded-lg border border-emerald-500/70 bg-emerald-500/15 text-emerald-300 text-sm font-bold touch-manipulation active:scale-95 active:bg-emerald-500/35 transition disabled:opacity-40"
          : "shrink-0 min-w-7 min-h-7 px-1.5 rounded-lg border border-emerald-500/70 bg-emerald-500/15 text-emerald-300 text-xs font-bold touch-manipulation active:scale-95 active:bg-emerald-500/35 transition disabled:opacity-40"
      }
    >
      {size === "full" ? HALF_GRAMS_LABEL_FULL : HALF_GRAMS_LABEL}
    </button>
  );
}
