import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { getSupabase } from "../../lib/supabase";

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

function firstParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string" && v.length) return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

/**
 * メール確認や magic link などで `ketolog://auth/callback?...` が開かれたときのハンドラ。
 * Google の in-app OAuth は `signInWithGoogle` 内で完結し、通常ここへは来ない。
 */
export default function AuthCallbackRoute() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();

  useEffect(() => {
    let alive = true;
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      const fromUrl = initialUrl ? Linking.parse(initialUrl).queryParams : undefined;

      const code =
        firstParam(params.code) ??
        pickQuery(fromUrl, "code");
      const err =
        firstParam(params.error) ??
        pickQuery(fromUrl, "error");
      const errDesc =
        firstParam(params.error_description) ??
        pickQuery(fromUrl, "error_description");

      if (err) {
        router.replace({
          pathname: "/(auth)/login",
          params: { authError: errDesc ?? err },
        });
        return;
      }
      if (!code) {
        router.replace("/(auth)/login");
        return;
      }
      const { error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
      if (!alive) return;
      if (exchangeError) {
        router.replace({
          pathname: "/(auth)/login",
          params: { authError: exchangeError.message },
        });
        return;
      }
      router.replace("/(app)/today");
    })();
    return () => {
      alive = false;
    };
  }, [params.code, params.error, params.error_description]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#e5e7eb" />
      <Text style={styles.text}>サインインを完了しています…</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  text: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
  },
});
