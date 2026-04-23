import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuShareImportItem } from "@ketolog/domain/menu-share-qr";
import { parseSingleRestaurantJson } from "@ketolog/domain/restaurant-json-v1";

import { importMenuItemsToRestaurantMobile } from "../lib/import-menu-items-mobile";
import { pickJsonFileText } from "../lib/pick-json-text-mobile";

type Props = {
  visible: boolean;
  supabase: SupabaseClient;
  userId: string;
  restaurantId: string | null;
  restaurantName: string;
  onClose: () => void;
  onImported: () => void;
  onToast?: (message: string) => void;
};

/** Web `ImportMenuItemsDrawer` と同一フロー */
export function ImportMenuItemsModal({
  visible,
  supabase,
  userId,
  restaurantId,
  restaurantName,
  onClose,
  onImported,
  onToast,
}: Props) {
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<MenuShareImportItem[] | null>(null);

  useEffect(() => {
    if (!visible) {
      setParsedCount(null);
      setParseError(null);
      setPendingItems(null);
      setImporting(false);
    }
  }, [visible]);

  const handlePick = useCallback(async () => {
    setParseError(null);
    setParsedCount(null);
    setPendingItems(null);
    const picked = await pickJsonFileText();
    if (!picked.ok) {
      if ("canceled" in picked && picked.canceled) return;
      setParseError("error" in picked ? picked.error : "ファイルを開けませんでした");
      return;
    }
    const result = parseSingleRestaurantJson(picked.text);
    if ("error" in result) {
      setParseError(result.error);
      return;
    }
    setPendingItems(result.menuItems);
    setParsedCount(result.menuItems.length);
  }, []);

  const handleImport = useCallback(async () => {
    if (!restaurantId || !pendingItems?.length) return;
    setImporting(true);
    setParseError(null);
    const res = await importMenuItemsToRestaurantMobile(
      supabase,
      userId,
      restaurantId,
      pendingItems
    );
    setImporting(false);
    if (res.error) {
      setParseError(res.error);
      return;
    }
    onToast?.("メニューを追加しました");
    onImported();
    onClose();
  }, [restaurantId, pendingItems, supabase, userId, onImported, onClose, onToast]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>メニューをJSONで追加</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>キャンセル</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>「{restaurantName}」にメニューアイテムを追加します。</Text>
          <Pressable
            onPress={() => {
              void handlePick();
            }}
            style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.pickBtnText}>JSONファイルを選択</Text>
          </Pressable>
          {parseError ? <Text style={styles.err}>{parseError}</Text> : null}
          {parsedCount != null ? (
            <View style={styles.preview}>
              <Text style={styles.previewMuted}>{parsedCount}アイテムを追加します</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              void handleImport();
            }}
            disabled={!pendingItems?.length || importing}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!pendingItems?.length || importing) && { opacity: 0.4 },
              pressed && { opacity: 0.88 },
            ]}
          >
            {importing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>追加する</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4b5563",
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2937",
    paddingBottom: 10,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
  cancel: { color: "#9ca3af", fontSize: 14 },
  hint: { color: "#9ca3af", fontSize: 12, marginBottom: 14 },
  pickBtn: {
    backgroundColor: "#374151",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  pickBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  err: { color: "#fecaca", fontSize: 12, marginTop: 10 },
  preview: {
    marginTop: 12,
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
  },
  previewMuted: { color: "#9ca3af", fontSize: 12 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
