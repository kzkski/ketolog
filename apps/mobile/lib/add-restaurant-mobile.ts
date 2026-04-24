import type { SupabaseClient } from "@supabase/supabase-js";

const NAME_MAX = 100;

export async function nextRestaurantDisplayOrder(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: row } = await supabase
    .from("restaurants")
    .select("display_order")
    .eq("user_id", userId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (row?.display_order ?? -1) + 1;
}

export async function addRestaurantMobile(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  category: string
): Promise<{ data: { id: string; name: string } | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "お店の名前を入力してください" };
  if (trimmed.length > NAME_MAX) {
    return { data: null, error: `店名は${NAME_MAX}文字以内にしてください` };
  }

  const displayOrder = await nextRestaurantDisplayOrder(supabase, userId);

  const first = await supabase
    .from("restaurants")
    .insert({
      user_id: userId,
      name: trimmed,
      category,
      display_order: displayOrder,
    })
    .select("id, name")
    .single();

  if (first.error && first.error.message.includes("display_order")) {
    const fallback = await supabase
      .from("restaurants")
      .insert({ user_id: userId, name: trimmed, category })
      .select("id, name")
      .single();
    if (fallback.error) return { data: null, error: fallback.error.message };
    return { data: fallback.data as { id: string; name: string }, error: null };
  }

  if (first.error) return { data: null, error: first.error.message };
  return { data: first.data as { id: string; name: string }, error: null };
}
