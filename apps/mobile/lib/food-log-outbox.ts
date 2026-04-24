/**
 * 未送信食事のローカル待ち。再送と Web/モバイル差分は docs/architecture/food-log-sync.md。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealType } from "@ketolog/types";

import { isTransientNetworkError } from "./network";

const storageKey = (userId: string) =>
  `@ketolog/food_log_outbox/v1/${userId}`;

export type FoodLogOutboxDraft = {
  /** `food_log.id` にそのまま使う（再送時のべき等性） */
  id: string;
  date: string;
  meal_type: MealType;
  item_name: string;
  grams: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  source: string;
  menu_item_id: string | null;
  saved_at: string;
};

type Stored = { drafts: FoodLogOutboxDraft[] };

async function readStored(userId: string): Promise<Stored> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return { drafts: [] };
  try {
    const j = JSON.parse(raw) as Stored;
    if (!j || !Array.isArray(j.drafts)) return { drafts: [] };
    return { drafts: j.drafts };
  } catch {
    return { drafts: [] };
  }
}

async function writeStored(userId: string, drafts: FoodLogOutboxDraft[]) {
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify({ drafts } satisfies Stored)
  );
}

export async function loadFoodLogOutbox(
  userId: string
): Promise<FoodLogOutboxDraft[]> {
  const { drafts } = await readStored(userId);
  return drafts.slice().sort((a, b) => a.saved_at.localeCompare(b.saved_at));
}

export async function enqueueFoodLogDraft(
  userId: string,
  draft: FoodLogOutboxDraft
): Promise<void> {
  const { drafts } = await readStored(userId);
  const without = drafts.filter((d) => d.id !== draft.id);
  without.push(draft);
  await writeStored(userId, without);
}

export async function removeFoodLogDraft(
  userId: string,
  draftId: string
): Promise<void> {
  const { drafts } = await readStored(userId);
  await writeStored(
    userId,
    drafts.filter((d) => d.id !== draftId)
  );
}

function newClientRowId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildFoodLogInsertPayload(
  userId: string,
  draft: FoodLogOutboxDraft
) {
  return {
    id: draft.id,
    user_id: userId,
    date: draft.date,
    meal_type: draft.meal_type,
    item_name: draft.item_name,
    grams: draft.grams,
    protein_g: draft.protein_g,
    fat_g: draft.fat_g,
    carbs_g: draft.carbs_g,
    source: draft.source,
    menu_item_id: draft.menu_item_id,
  };
}

export async function sendFoodLogDraft(
  supabase: SupabaseClient,
  userId: string,
  draft: FoodLogOutboxDraft
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = buildFoodLogInsertPayload(userId, draft);
  const { error } = await supabase.from("food_log").insert(payload);
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: true };
  if (isTransientNetworkError(error)) {
    return { ok: false, error: "通信に失敗しました。しばらくしてから再送してください。" };
  }
  return { ok: false, error: error.message };
}

export { newClientRowId };
