import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUserSettings } from "@ketolog/domain/diet-phase";
import { pfcGramsFromNullablePer100 } from "@ketolog/domain/pfc";
import type { BarcodePrefill, OwnBarcodeMenuMatch } from "@ketolog/domain/barcode-menu-prefill";
import type { MealType } from "@ketolog/types";

import {
  buildFoodLogInsertPayload,
  enqueueFoodLogDraft,
  newClientRowId,
  type FoodLogOutboxDraft,
} from "./food-log-outbox";
import { getIsOnline, isTransientNetworkError } from "./network";
import { writePfcTargetSnapshot } from "./pfc-target-snapshot-write";

export type BuildQuickBarcodeDraftInput = {
  prefill: BarcodePrefill;
  selectedOwnMenu: OwnBarcodeMenuMatch | null;
  snapshotRestaurantId: string;
  grams: number;
  mealType: MealType;
  date: string;
};

export function buildQuickBarcodeFoodLogDraft(input: BuildQuickBarcodeDraftInput): FoodLogOutboxDraft {
  const { prefill, selectedOwnMenu, snapshotRestaurantId, grams, mealType, date } = input;

  const useOwn = prefill.source === "own_menu_item" && selectedOwnMenu;
  const itemName = useOwn ? selectedOwnMenu.name : prefill.name;
  const p100 = useOwn ? selectedOwnMenu.protein_per_100g : prefill.protein_per_100g;
  const f100 = useOwn ? selectedOwnMenu.fat_per_100g : prefill.fat_per_100g;
  const c100 = useOwn ? selectedOwnMenu.carbs_per_100g : prefill.carbs_per_100g;
  const v = pfcGramsFromNullablePer100(p100, f100, c100, grams);

  return {
    id: newClientRowId(),
    date,
    meal_type: mealType,
    item_name: itemName,
    grams,
    protein_g: v.p,
    fat_g: v.f,
    carbs_g: v.c,
    source: useOwn ? selectedOwnMenu.restaurant_id : snapshotRestaurantId,
    menu_item_id: useOwn ? selectedOwnMenu.id : null,
    saved_at: new Date().toISOString(),
  };
}

export type PersistQuickBarcodeResult =
  | { ok: true; message: string; offline: boolean }
  | { ok: false; error: string };

/** `FoodLogEntryModal` / `MenuItemEditorModal.handleLogOnly` と同じ online insert / offline enqueue */
export async function persistQuickBarcodeFoodLog(
  supabase: SupabaseClient,
  userId: string,
  draft: FoodLogOutboxDraft
): Promise<PersistQuickBarcodeResult> {
  const online = await getIsOnline();
  if (!online) {
    await enqueueFoodLogDraft(userId, draft);
    return {
      ok: true,
      offline: true,
      message: "オフラインのため端末に保存しました。通信が戻ったら一覧から再送してください。",
    };
  }

  const { error } = await supabase.from("food_log").insert(buildFoodLogInsertPayload(userId, draft));
  if (error) {
    if (error.code === "23505") {
      return { ok: true, offline: false, message: "保存しました" };
    }
    if (isTransientNetworkError(error)) {
      await enqueueFoodLogDraft(userId, draft);
      return {
        ok: true,
        offline: true,
        message: "通信に失敗しました。端末に下書きを残しました。通信が戻ったら再送してください。",
      };
    }
    return { ok: false, error: error.message };
  }

  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("diet_phase, phase_profiles")
    .eq("user_id", userId)
    .maybeSingle();
  if (settingsRow) {
    void writePfcTargetSnapshot(supabase, {
      userId,
      date: draft.date,
      settings: normalizeUserSettings(settingsRow),
      source: "food_log_ensure",
    });
  }

  return { ok: true, offline: false, message: "保存しました" };
}