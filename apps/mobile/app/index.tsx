import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuthSessionContext } from "../contexts/AuthSessionContext";

export default function IndexRoute() {
  const { session, loading, initError } = useAuthSessionContext();

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
    return <Redirect href="/(app)/today" />;
  }
  return <Redirect href="/(auth)/login" />;
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
