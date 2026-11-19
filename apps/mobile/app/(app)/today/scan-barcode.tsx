import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/** Phase 0: クイックアクション起動・ルート解決の確認用スタブ（Phase 1 でスキャン UI） */
export default function ScanBarcodeStubScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "バーコード読み取り" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Phase 0 — Quick Action 起動確認</Text>
        <Text style={styles.body}>
          ホーム画面のクイックアクションからこの画面へ遷移できています。Phase 1 でカメラ・記録フローを実装します。
        </Text>
        <StatusBar style="auto" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#f9fafb",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 22,
  },
});