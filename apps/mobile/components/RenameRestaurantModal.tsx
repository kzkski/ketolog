import { useCallback, useEffect, useState } from "react";
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

import {
  RESTAURANT_NAME_MAX_LENGTH,
  updateRestaurantNameMobile,
} from "../lib/update-restaurant-name-mobile";

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
  restaurantId: string | null;
  initialName: string;
  onClose: () => void;
  /** 保存成功後（店舗行の更新・お気に入りグループ名の同期は親で） */
  onRenamed: (
    nextName: string,
    updatedFavoriteGroupId: string | null,
    restaurantId: string
  ) => void;
  onToast?: (message: string) => void;
};

export function RenameRestaurantModal({
  visible,
  supabase,
  userId,
  restaurantId,
  initialName,
  onClose,
  onRenamed,
  onToast,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setError(null);
    }
  }, [visible, initialName, restaurantId]);

  const handleClose = useCallback(() => {
    if (busy) return;
    setError(null);
    onClose();
  }, [busy, onClose]);

  const handleSave = useCallback(async () => {
    if (!restaurantId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("店名を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateRestaurantNameMobile(supabase, userId, restaurantId, trimmed);
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error ?? "保存に失敗しました");
      onToast?.(res.error ?? "保存に失敗しました");
      return;
    }
    const nextName = String((res.data as { name: string }).name);
    onRenamed(nextName, res.updatedFavoriteGroupId, restaurantId);
    onToast?.("店名を変更しました");
    onClose();
  }, [name, restaurantId, supabase, userId, onRenamed, onClose, onToast]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>お店の名前を変更</Text>
            <Pressable onPress={handleClose} disabled={busy} hitSlop={8}>
              <Text style={styles.cancel}>キャンセル</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>店名</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="店名"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            editable={!busy}
            maxLength={RESTAURANT_NAME_MAX_LENGTH}
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
              <Text style={styles.saveBtnText}>保存</Text>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  cancel: { color: COLORS.textMuted, fontSize: 15 },
  label: { color: COLORS.textMuted, fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 8 },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#022c22", fontSize: 16, fontWeight: "700" },
});
