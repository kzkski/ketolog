import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getSupabase } from "./supabase";

function pickQuery(
  queryParams: Linking.QueryParams | null | undefined,
  key: string,
): string | undefined {
  if (!queryParams) return undefined;
  const raw = queryParams[key];
  if (typeof raw === "string" && raw.length) return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

/**
 * ネイティブでは PKCE + `expo-web-browser` の in-app ブラウザで OAuth を完了し、
 * リダイレクト URL の `code` を `exchangeCodeForSession` に渡す（Supabase 推奨の Expo パターン）
 */
export async function signInWithGoogle(): Promise<{ cancelled: boolean }> {
  const supabase = getSupabase();
  const redirectTo = makeRedirectUri({ path: "auth/callback" });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) {
    throw error;
  }
  if (!data?.url) {
    throw new Error("Google ログイン用の URL を取得できませんでした。");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: false,
  });

  if (result.type !== "success") {
    return { cancelled: true };
  }

  const { queryParams } = Linking.parse(result.url);
  const oauthError = pickQuery(queryParams, "error");
  if (oauthError) {
    const desc = pickQuery(queryParams, "error_description");
    throw new Error(desc || oauthError);
  }
  const code = pickQuery(queryParams, "code");
  if (!code) {
    throw new Error("コールバックURLに auth code がありません。Supabase の Redirect URL と `scheme` 設定を確認してください。");
  }
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw exchangeError;
  }
  return { cancelled: false };
}
