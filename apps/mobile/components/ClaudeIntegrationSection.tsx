import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CLAUDE_INTEGRATION_MOBILE_OPEN_WEB_LABEL,
  CLAUDE_INTEGRATION_MOBILE_WEB_ONLY_HINT,
  CLAUDE_INTEGRATION_SECTION_DESCRIPTION,
  CLAUDE_INTEGRATION_SECTION_TITLE,
  CLAUDE_INTEGRATION_SECURITY_HINT,
} from "@ketolog/domain/claude-integration";

function resolveKetologWebOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_KETOLOG_WEB_ORIGIN;
  if (raw === undefined || raw === null) return null;
  const origin = String(raw).trim().replace(/\/$/, "");
  if (origin === "") return null;
  try {
    if (new URL(origin).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return origin;
}

export function ClaudeIntegrationSection() {
  const webOrigin = resolveKetologWebOrigin();
  const settingsUrl = webOrigin ? `${webOrigin}/today` : null;

  const openWebSettings = () => {
    if (!settingsUrl) return;
    void Linking.openURL(settingsUrl);
  };

  return (
    <View>
      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>{CLAUDE_INTEGRATION_SECTION_TITLE}</Text>
      <Text style={styles.sectionHint}>{CLAUDE_INTEGRATION_SECTION_DESCRIPTION}</Text>
      <Text style={[styles.sectionHint, { marginTop: 6 }]}>{CLAUDE_INTEGRATION_SECURITY_HINT}</Text>
      <Text style={[styles.sectionHint, { marginTop: 10, color: "#fbbf24" }]}>
        {CLAUDE_INTEGRATION_MOBILE_WEB_ONLY_HINT}
      </Text>
      {settingsUrl ? (
        <Pressable
          onPress={openWebSettings}
          style={({ pressed }) => [styles.openWebBtn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.openWebBtnText}>{CLAUDE_INTEGRATION_MOBILE_OPEN_WEB_LABEL}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.sectionHint, { marginTop: 8 }]}>
          Web 版の URL（EXPO_PUBLIC_KETOLOG_WEB_ORIGIN）が未設定のため、ブラウザから直接開いてください。
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  sectionHint: {
    color: "#6b7280",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  openWebBtn: {
    marginTop: 10,
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  openWebBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
