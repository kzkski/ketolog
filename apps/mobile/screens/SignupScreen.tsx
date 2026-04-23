import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { makeRedirectUri } from "expo-auth-session";
import { getSupabase } from "../lib/supabase";
import { signInWithGoogle } from "../lib/googleSignIn";

export function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignUp() {
    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const redirectTo = makeRedirectUri({ path: "auth/callback" });
    const { data, error: signUpError } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      router.replace("/(app)/today");
    } else {
      setInfo("確認が必要な場合は、届いたメールのリンクから完了してください。");
    }
    setLoading(false);
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { cancelled } = await signInWithGoogle();
      if (cancelled) {
        // ユーザー操作で閉じた
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google 登録に失敗しました。");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Ketolog</Text>
        <Text style={styles.subtitle}>新規登録</Text>

        <Pressable
          onPress={handleGoogleSignUp}
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={styles.googleBtnText}>Googleで登録</Text>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.or}>または</Text>
          <View style={styles.divider} />
        </View>

        <Text style={styles.label}>メールアドレス</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
          placeholderTextColor="#6b7280"
        />
        <Text style={styles.label}>パスワード（6文字以上）</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor="#6b7280"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Pressable
          onPress={handleSignUp}
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>アカウント作成</Text>
          )}
        </Pressable>

        <Text style={styles.footer}>
          すでにアカウントをお持ちの方は{" "}
          <Link href="/(auth)/login" style={styles.link}>
            ログイン
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    color: "#d1d5db",
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  error: {
    color: "#f87171",
    fontSize: 14,
    marginBottom: 12,
  },
  info: {
    color: "#93c5fd",
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  googleBtn: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  googleBtnText: {
    color: "#111",
    fontWeight: "600",
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 8,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#3f3f46",
  },
  or: {
    color: "#9ca3af",
    fontSize: 12,
  },
  footer: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
  },
  link: {
    color: "#34d399",
    fontWeight: "600",
  },
});
