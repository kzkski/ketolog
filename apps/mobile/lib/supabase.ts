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
    const url = process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_URL?.trim();
    const key = process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY?.trim();
    if (url && key) return { url, key };
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
        ? "実機用の `EXPO_PUBLIC_SUPABASE_PRODUCTION_URL` / `EXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY` が未設定、または空です。"
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
