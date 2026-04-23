import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

let client: SupabaseClient | null = null;

/**
 * 実機（物理デバイス）では本番 Supabase、シミュレータ / エミュレータではローカル用の
 * `EXPO_PUBLIC_SUPABASE_*` を使う（`Constants.isDevice` は Expo が提供する判別）。
 */
function resolveSupabaseEnv(): { url: string; key: string } | null {
  const onPhysicalDevice = Constants.isDevice === true;
  if (onPhysicalDevice) {
    // Prefer dedicated production keys for physical devices, but keep backward
    // compatibility with EXPO_PUBLIC_SUPABASE_* so TestFlight builds don't break
    // when only legacy keys are configured on EAS.
    const productionUrl =
      process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_URL?.trim();
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
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) return { url, key };
  return null;
}

export function isSupabaseConfigured(): boolean {
  return resolveSupabaseEnv() != null;
}

export function getSupabase(): SupabaseClient {
  const resolved = resolveSupabaseEnv();
  if (!resolved) {
    const onPhysicalDevice = Constants.isDevice === true;
    throw new Error(
      onPhysicalDevice
        ? "実機用の `EXPO_PUBLIC_SUPABASE_PRODUCTION_URL` / `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY`（またはフォールバックの `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`）が未設定、または空です。"
        : "シミュレータ用の `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` が未設定、または空です。"
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
