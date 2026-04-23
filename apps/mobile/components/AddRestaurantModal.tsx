import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addRestaurantMobile } from "../lib/add-restaurant-mobile";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
};

type Props = {
  visible: boolean;
  supabase: SupabaseClient;
  userId: string;
  onClose: () => void;
  onAdded: (restaurant: { id: string; name: string }) => void;
  onToast: (message: string) => void;
};

export function AddRestaurantModal({
  visible,
  supabase,
  userId,
  onClose,
  onAdded,
  onToast,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (busy) return;
    setName("");
    setError(null);
    onClose();
  }, [busy, onClose]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await addRestaurantMobile(supabase, userId, name, "external");
    setBusy(false);
    if (r.error || !r.data) {
      setError(r.error ?? "追加に失敗しました");
      onToast(r.error ?? "追加に失敗しました");
      return;
    }
    onAdded(r.data);
    setName("");
    onClose();
    onToast("お店を追加しました");
  }, [name, supabase, userId, onAdded, onClose, onToast]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>お店を追加</Text>
            <Pressable onPress={handleClose} disabled={busy} hitSlop={8}>
              <Text style={styles.cancel}>キャンセル</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>店名</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例: サイゼリヤ"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            editable={!busy}
            maxLength={100}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void handleSave()}
            disabled={busy}
            style={[styles.saveBtn, busy && { opacity: 0.55 }]}
          >
            {busy ? (
              <ActivityIndicator color="#022c22" />
            ) : (
              <Text style={styles.saveBtnText}>追加する</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  cancel: { color: COLORS.textMuted, fontSize: 14 },
  label: { color: COLORS.textMuted, fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 12,
  },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 10 },
  saveBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { color: "#022c22", fontWeight: "700", fontSize: 16 },
});
