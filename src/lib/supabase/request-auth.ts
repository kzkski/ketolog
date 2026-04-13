import { cache } from "react";
import { createClient } from "./server";

/**
 * 同一リクエスト内の RSC / Server Actions で `getUser()` と Supabase クライアントを重複取得しない。
 * @see https://react.dev/reference/react/cache
 */
export const getSupabaseAuthForRequest = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
