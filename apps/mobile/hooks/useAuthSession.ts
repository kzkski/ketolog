import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

/** `getSession()` が返らないとスプラッシュが消えず固まるため、上限を設ける */
const GET_SESSION_TIMEOUT_MS = 15_000;

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    (async () => {
      try {
        type GetResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
        const sessionTask = supabase.auth.getSession().then((r): { kind: "session"; r: GetResult } => ({
          kind: "session",
          r,
        }));
        const timeoutTask = new Promise<{ kind: "timeout" }>((resolve) => {
          setTimeout(() => resolve({ kind: "timeout" }), GET_SESSION_TIMEOUT_MS);
        });
        const outcome = await Promise.race([sessionTask, timeoutTask]);
        if (!mounted) return;
        if (outcome.kind === "timeout") {
          setInitError(
            new Error(
              "セッション確認がタイムアウトしました。ネットワーク、VPN、EXPO_PUBLIC_SUPABASE_URL / ANON_KEY を確認してください。"
            )
          );
          return;
        }
        const { data, error } = outcome.r;
        if (error) {
          setInitError(error);
          return;
        }
        setSession(data.session);
      } catch (e) {
        if (!mounted) return;
        setInitError(e instanceof Error ? e : new Error("セッション取得に失敗しました。"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, initError, signOut };
}
