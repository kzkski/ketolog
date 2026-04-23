import type { SupabaseClient } from "@supabase/supabase-js";

import { SNAPSHOT_RESTAURANT_NAME } from "./snapshot-restaurant";

function isUniqueConstraintViolation(
  err: { code?: string; message?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return typeof err.message === "string" && err.message.includes("duplicate key");
}

/** Web `getOrCreateSnapshotRestaurant`（`src/app/today/actions/restaurant.ts`）と同じ挙動。 */
export async function getOrCreateSnapshotRestaurant(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: { id: string } | null; error: string | null }> {
  const { data: existingRows, error: selectError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("user_id", userId)
    .eq("name", SNAPSHOT_RESTAURANT_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) return { data: null, error: selectError.message };
  const existing = existingRows?.[0];
  if (existing?.id) return { data: { id: String(existing.id) }, error: null };

  const { data: maxRow } = await supabase
    .from("restaurants")
    .select("display_order")
    .eq("user_id", userId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = (maxRow?.display_order ?? -1) + 1;

  const insertPrimary = await supabase
    .from("restaurants")
    .insert({
      user_id: userId,
      name: SNAPSHOT_RESTAURANT_NAME,
      category: "other",
      display_order: displayOrder,
    })
    .select("id")
    .single();

  let inserted = insertPrimary;

  if (insertPrimary.error && insertPrimary.error.message.includes("display_order")) {
    inserted = await supabase
      .from("restaurants")
      .insert({
        user_id: userId,
        name: SNAPSHOT_RESTAURANT_NAME,
        category: "other",
      })
      .select("id")
      .single();
  }

  if (inserted.error && isUniqueConstraintViolation(inserted.error)) {
    const { data: afterConflict, error: retryErr } = await supabase
      .from("restaurants")
      .select("id")
      .eq("user_id", userId)
      .eq("name", SNAPSHOT_RESTAURANT_NAME)
      .order("created_at", { ascending: true })
      .limit(1);
    if (retryErr) return { data: null, error: retryErr.message };
    const row = afterConflict?.[0];
    if (row?.id) return { data: { id: String(row.id) }, error: null };
  }

  if (inserted.error) return { data: null, error: inserted.error.message };
  const id = inserted.data?.id;
  if (!id) return { data: null, error: "スナップショット店舗の作成に失敗しました" };
  return { data: { id: String(id) }, error: null };
}
