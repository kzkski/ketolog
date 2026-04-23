import type { MealType } from "@ketolog/types";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

export const MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

export const MEAL_TAB_STYLES: Record<MealType, { row: string; label: string }> = {
  breakfast: {
    row: "border-rose-400 bg-rose-400/10",
    label: "text-rose-300",
  },
  lunch: {
    row: "border-cyan-400 bg-cyan-400/10",
    label: "text-cyan-300",
  },
  dinner: {
    row: "border-violet-400 bg-violet-400/10",
    label: "text-violet-300",
  },
  snack: {
    row: "border-teal-400 bg-teal-400/10",
    label: "text-teal-300",
  },
};
