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
import { getSupabase } from "../lib/supabase";
import { signInWithGoogle } from "../lib/googleSignIn";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handlePasswordLogin() {
    setLoading(true);
    setError(null);
    const { error: signInError } = await getSupabase().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError(null);
    try {
      const { cancelled } = await signInWithGoogle();
      if (cancelled) {
        // ユーザー操作で閉じた — 黙ってよい
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google ログインに失敗しました。");
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
        <Text style={styles.subtitle}>PoC ログイン</Text>

        <Pressable
          onPress={handleGoogleLogin}
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={styles.googleBtnText}>Googleでログイン</Text>
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
        <Text style={styles.label}>パスワード</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor="#6b7280"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handlePasswordLogin}
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>ログイン</Text>}
        </Pressable>
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
});
