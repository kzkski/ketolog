import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;

/**
 * Prefer production keys first, then fall back to legacy/local keys.
 * Do not branch on device detection because runtime flags can differ
 * between Expo Go / dev build / TestFlight.
 */
function resolveSupabaseEnv(): { url: string; key: string } | null {
  const productionUrl = process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_URL?.trim();
  const productionKey =
    process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY?.trim();
  if (productionUrl && productionKey) {
    return { url: productionUrl, key: productionKey };
  }
  const fallbackUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const fallbackKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (fallbackUrl && fallbackKey) return { url: fallbackUrl, key: fallbackKey };
  return null;
}

export function isSupabaseConfigured(): boolean {
  return resolveSupabaseEnv() != null;
}

export function getSupabase(): SupabaseClient {
  const resolved = resolveSupabaseEnv();
  if (!resolved) {
    throw new Error(
      "`EXPO_PUBLIC_SUPABASE_PRODUCTION_URL` / `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY` または `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` が未設定、または空です。"
    );
  }
  if (!client) {
    const { url: supabaseUrl, key: supabaseAnonKey } = resolved;
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}
