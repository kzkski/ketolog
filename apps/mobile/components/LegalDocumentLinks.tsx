import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openKetologLegalUrl, resolveKetologLegalUrls } from "../lib/ketolog-legal-urls";

type Props = {
  /** 薄い補足（例: 認証画面。variant auth のみ） */
  introText?: string;
  /** 認証画面は中央、設定は左寄せ＋セクション見出し */
  variant: "auth" | "settings";
  onOpenError?: (message: string) => void;
};

/**
 * 利用規約・プライバシー。URL が1つも解決できなければ null（行自体非表示）。
 */
export function LegalDocumentLinks({ introText, variant, onOpenError }: Props) {
  const { terms, privacy } = useMemo(() => resolveKetologLegalUrls(), []);
  if (!terms && !privacy) return null;

  const openTerms = useCallback(() => {
    if (terms) void openKetologLegalUrl(terms, onOpenError);
  }, [terms, onOpenError]);
  const openPrivacy = useCallback(() => {
    if (privacy) void openKetologLegalUrl(privacy, onOpenError);
  }, [privacy, onOpenError]);

  const linkRow = (
    <View style={variant === "auth" ? styles.rowAuth : styles.rowSettings}>
      {terms ? (
        <Pressable
          onPress={openTerms}
          accessibilityRole="link"
          accessibilityLabel="利用規約を外部ブラウザで開く"
          style={({ pressed }) => [pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.link}>利用規約</Text>
        </Pressable>
      ) : null}
      {terms && privacy ? <Text style={styles.sep}> ・ </Text> : null}
      {privacy ? (
        <Pressable
          onPress={openPrivacy}
          accessibilityRole="link"
          accessibilityLabel="プライバシーポリシーを外部ブラウザで開く"
          style={({ pressed }) => [pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.link}>プライバシーポリシー</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (variant === "settings") {
    return (
      <View style={styles.settingsBlock}>
        <Text style={styles.settingsSectionTitle}>利用規約・プライバシー</Text>
        <Text style={styles.settingsHint}>
          リンク先は https のみ開きます。別アプリ（ブラウザ）で表示されます。
        </Text>
        {linkRow}
      </View>
    );
  }

  return (
    <View style={styles.wrapAuth}>
      {introText ? <Text style={styles.introAuth}>{introText}</Text> : null}
      {linkRow}
    </View>
  );
}

const styles = StyleSheet.create({
  settingsBlock: { marginTop: 22 },
  settingsSectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  settingsHint: { color: "#6b7280", fontSize: 11, lineHeight: 16, marginBottom: 8 },
  wrapAuth: { alignItems: "center", marginTop: 8 },
  introAuth: { color: "#6b7280", fontSize: 12, textAlign: "center", marginBottom: 6, lineHeight: 16 },
  rowAuth: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  rowSettings: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" },
  sep: { color: "#6b7280", fontSize: 12 },
  link: { color: "#34d399", fontSize: 12, textDecorationLine: "underline", fontWeight: "500" },
});
