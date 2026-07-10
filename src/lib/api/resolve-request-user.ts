import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { sessionIdFromAccessToken } from "@ketolog/domain/claude-integration";

export type ResolvedRequestUser = {
  user: User;
  accessToken: string | null;
  sessionId: string | null;
};

function bearerTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function resolveRequestUser(request: Request): Promise<ResolvedRequestUser | null> {
  const bearer = bearerTokenFromRequest(request);

  if (bearer) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return null;

    const supabase = createSupabaseJsClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer);
    if (error || !user) return null;
    return {
      user,
      accessToken: bearer,
      sessionId: sessionIdFromAccessToken(bearer),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? null;
  return {
    user,
    accessToken,
    sessionId: accessToken ? sessionIdFromAccessToken(accessToken) : null,
  };
}
