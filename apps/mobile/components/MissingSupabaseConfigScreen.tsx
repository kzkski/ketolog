import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

export function MissingSupabaseConfigScreen() {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Supabase 未設定</Text>
      <Text style={styles.hint}>
        {
          "接続用の環境変数が不足しています。`apps/mobile/.env` または EAS env に次を設定し、再ビルドしてください。\n\nEXPO_PUBLIC_SUPABASE_PRODUCTION_URL\nEXPO_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY\n\n互換のため次も利用できます。\nEXPO_PUBLIC_SUPABASE_URL\nEXPO_PUBLIC_SUPABASE_ANON_KEY\n\n雛形は `apps/mobile/.env.example` を参照。"
        }
      </Text>
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
    padding: 20,
  },
  errorTitle: {
    color: "#f87171",
    fontSize: 18,
    fontWeight: "600",
  },
  hint: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
    lineHeight: 18,
  },
});
