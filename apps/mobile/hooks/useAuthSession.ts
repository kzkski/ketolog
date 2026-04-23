import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

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
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
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
