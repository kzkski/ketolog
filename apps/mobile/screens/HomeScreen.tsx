import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";

type HomeScreenProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

export function HomeScreen({ session, onSignOut }: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ketolog</Text>
      <Text style={styles.hint}>
        ログイン中: {session.user.email ?? session.user.id}
      </Text>
      <Pressable
        onPress={() => {
          void onSignOut();
        }}
        style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.outlineBtnText}>ログアウト</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
    color: "#4b5563",
    textAlign: "center",
  },
  outlineBtn: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  outlineBtnText: {
    color: "#374151",
    fontWeight: "600",
  },
});
