import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuthSession } from "./hooks/useAuthSession";
import { isSupabaseConfigured } from "./lib/supabase";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TodayScreen } from "./screens/TodayScreen";
import { LoginScreen } from "./screens/LoginScreen";

function MissingSupabaseConfigScreen() {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Supabase 未設定</Text>
      <Text style={styles.hint}>
        {"接続用の環境変数が不足しています。`apps/mobile/.env` または EAS env に次を設定し、再ビルドしてください。\n\nEXPO_PUBLIC_SUPABASE_PRODUCTION_URL\nEXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY\n\n互換のため次も利用できます。\nEXPO_PUBLIC_SUPABASE_URL\nEXPO_PUBLIC_SUPABASE_ANON_KEY\n\n雛形は `apps/mobile/.env.example` を参照。"}
      </Text>
      <StatusBar style="light" />
    </View>
  );
}

function AuthenticatedApp() {
  const { session, loading, initError, signOut } = useAuthSession();

  useEffect(() => {
    if (!loading) {
      void SplashScreen.hideAsync();
    }
  }, [loading]);

  if (initError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>起動エラー</Text>
        <Text style={styles.errorMsg}>{initError.message}</Text>
        <Text style={styles.hint}>
          ヒント: クライアント接続用の Anon キー・URL か、ネットワーク、Supabase プロジェクトの状態を確認してください。
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>セッションを確認しています…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (session) {
    return (
      <SafeAreaProvider>
        <TodayScreen session={session} onSignOut={signOut} />
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }

  return (
    <>
      <LoginScreen />
      <StatusBar style="light" />
    </>
  );
}

export default function App() {
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      void SplashScreen.hideAsync();
    }
  }, [configured]);

  if (!configured) {
    return <MissingSupabaseConfigScreen />;
  }
  return <AuthenticatedApp />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: "#9ca3af",
  },
  errorTitle: {
    color: "#f87171",
    fontSize: 18,
    fontWeight: "600",
  },
  errorMsg: {
    color: "#e5e7eb",
    marginTop: 8,
    textAlign: "center",
  },
  hint: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
    lineHeight: 18,
  },
});
