import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRestaurantTemplateDocument,
  parseSingleRestaurantJson,
  type SingleRestaurantJsonPayload,
} from "@ketolog/domain/restaurant-json-v1";

import { addRestaurantMobile } from "../lib/add-restaurant-mobile";
import { importRestaurantDataMobile } from "../lib/import-restaurant-data-mobile";
import { pickJsonFileText } from "../lib/pick-json-text-mobile";
import { loadPresetJsonText, RESTAURANT_PRESET_LIST } from "../lib/restaurant-presets-mobile";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  card: "#1f2937",
};

/** Web `TodayClient.tsx` の `CATEGORY_OPTIONS` と同一 */
const CATEGORY_OPTIONS = [
  { value: "external", label: "外食" },
  { value: "homemade", label: "自炊" },
  { value: "convenience", label: "コンビニ" },
  { value: "other", label: "その他" },
] as const;

type Step = "choice" | "manual" | "import" | "preset";

const PRESET_VISIBLE = 5;

type Props = {
  visible: boolean;
  supabase: SupabaseClient;
  userId: string;
  onClose: () => void;
  onAdded: (restaurant: { id: string }) => void;
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
  const [step, setStep] = useState<Step>("choice");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("external");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importParsedName, setImportParsedName] = useState<string | null>(null);
  const [importItemCount, setImportItemCount] = useState<number | null>(null);
  const [importReadyPayload, setImportReadyPayload] = useState<SingleRestaurantJsonPayload | null>(null);

  const [presetExpanded, setPresetExpanded] = useState(false);
  const [fetchingPreset, setFetchingPreset] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("choice");
      setName("");
      setCategory("external");
      setBusy(false);
      setError(null);
      setImportParsedName(null);
      setImportItemCount(null);
      setImportReadyPayload(null);
      setPresetExpanded(false);
      setFetchingPreset(null);
      setFetchError(null);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleManualSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await addRestaurantMobile(supabase, userId, name, category);
    setBusy(false);
    if (r.error || !r.data) {
      setError(r.error ?? "追加に失敗しました");
      onToast(r.error ?? "追加に失敗しました");
      return;
    }
    onAdded({ id: r.data.id });
    onClose();
    onToast("お店を追加しました");
  }, [name, category, supabase, userId, onAdded, onClose, onToast]);

  const handlePickJson = useCallback(async () => {
    setError(null);
    setImportReadyPayload(null);
    setImportParsedName(null);
    setImportItemCount(null);
    const picked = await pickJsonFileText();
    if (!picked.ok) {
      if ("canceled" in picked && picked.canceled) return;
      setError("error" in picked ? picked.error : "ファイルを開けませんでした");
      return;
    }
    const result = parseSingleRestaurantJson(picked.text);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setImportReadyPayload(result);
    setImportParsedName(result.name);
    setImportItemCount(result.menuItems.length);
  }, []);

  const handleImportNewRestaurant = useCallback(async () => {
    if (!importReadyPayload || "error" in importReadyPayload) return;
    setBusy(true);
    setError(null);
    const res = await importRestaurantDataMobile(supabase, userId, {
      version: 1,
      restaurants: [
        {
          name: importReadyPayload.name,
          category: importReadyPayload.category,
          menuItems: importReadyPayload.menuItems,
        },
      ],
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      onToast(res.error);
      return;
    }
    if (res.newRestaurants.length === 0) {
      const msg = `「${importReadyPayload.name}」は既に登録されています。`;
      setError(msg);
      onToast(msg);
      return;
    }
    onAdded({ id: res.newRestaurants[0].id });
    onClose();
    onToast("お店をインポートしました");
  }, [importReadyPayload, supabase, userId, onAdded, onClose, onToast]);

  const shareTemplate = useCallback(async () => {
    const payload = buildRestaurantTemplateDocument();
    const text = JSON.stringify(payload, null, 2);
    try {
      await Share.share({ message: text, title: "ketolog-template.json" });
    } catch {
      onToast("共有を開けませんでした");
    }
  }, [onToast]);

  const handleSelectPreset = useCallback(
    async (file: string) => {
      setFetchingPreset(file);
      setFetchError(null);
      try {
        const loaded = await loadPresetJsonText(file);
        if (!loaded.ok) {
          setFetchError(loaded.error);
          return;
        }
        const parsed = parseSingleRestaurantJson(loaded.text);
        if ("error" in parsed) {
          setFetchError(parsed.error);
          return;
        }
        const res = await importRestaurantDataMobile(supabase, userId, {
          version: 1,
          restaurants: [
            { name: parsed.name, category: parsed.category, menuItems: parsed.menuItems },
          ],
        });
        if (res.error) {
          setFetchError(res.error);
          onToast(res.error);
          return;
        }
        if (res.newRestaurants.length === 0) {
          const msg = `「${parsed.name}」は既に登録されています。`;
          setFetchError(msg);
          onToast(msg);
          return;
        }
        onAdded({ id: res.newRestaurants[0].id });
        onClose();
        onToast("お店を追加しました");
      } finally {
        setFetchingPreset(null);
      }
    },
    [supabase, userId, onAdded, onClose, onToast]
  );

  const visiblePresets = presetExpanded
    ? RESTAURANT_PRESET_LIST
    : RESTAURANT_PRESET_LIST.slice(0, PRESET_VISIBLE);

  const title =
    step === "choice"
      ? "お店を追加"
      : step === "manual"
        ? "手入力で追加"
        : step === "import"
          ? "JSONからお店を追加"
          : "プリセットから選ぶ";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerBarLeft} />
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {step === "choice" ? (
              <View style={styles.headerBarRight} />
            ) : (
              <View style={styles.headerBarRight}>
                <Pressable
                  onPress={handleClose}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityLabel="キャンセル"
                  style={styles.headerCancelHit}
                >
                  <Text style={styles.headerCancelText}>キャンセル</Text>
                </Pressable>
              </View>
            )}
          </View>

          {step === "choice" ? (
            <View style={styles.section}>
              <Pressable
                onPress={() => setStep("manual")}
                style={styles.choiceBtn}
                disabled={busy}
              >
                <Text style={styles.choiceBtnText}>手入力で追加</Text>
              </Pressable>
              <Pressable
                onPress={() => setStep("import")}
                style={styles.choiceBtn}
                disabled={busy}
              >
                <Text style={styles.choiceBtnText}>JSONからインポート</Text>
              </Pressable>
              <Pressable
                onPress={() => setStep("preset")}
                style={styles.choiceBtn}
                disabled={busy}
              >
                <Text style={styles.choiceBtnText}>プリセットから選ぶ</Text>
              </Pressable>
            </View>
          ) : null}

          {step === "manual" ? (
            <View style={styles.section}>
              <Text style={styles.label}>お店の名前</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="例: 神鶏"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                editable={!busy}
                maxLength={100}
              />
              <Text style={styles.label}>カテゴリ</Text>
              <View style={styles.catGrid}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setCategory(opt.value)}
                    style={[
                      styles.catChip,
                      category === opt.value && styles.catChipActive,
                    ]}
                    disabled={busy}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        category === opt.value && styles.catChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void handleManualSave()}
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
          ) : null}

          {step === "import" ? (
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => void handlePickJson()}
                style={styles.fileBtn}
                disabled={busy}
              >
                <Text style={styles.fileBtnText}>JSONファイルを選択</Text>
              </Pressable>
              <Pressable
                onPress={() => void shareTemplate()}
                style={styles.secondaryBtn}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnText}>テンプレートを共有</Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {importParsedName != null && importItemCount != null ? (
                <View style={styles.previewBox}>
                  <Text style={styles.previewName}>{importParsedName}</Text>
                  <Text style={styles.previewMeta}>{importItemCount}アイテム</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => void handleImportNewRestaurant()}
                disabled={busy || !importReadyPayload}
                style={[styles.saveBtn, (busy || !importReadyPayload) && { opacity: 0.4 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#022c22" />
                ) : (
                  <Text style={styles.saveBtnText}>インポートする</Text>
                )}
              </Pressable>
            </ScrollView>
          ) : null}

          {step === "preset" ? (
            <ScrollView style={styles.scroll}>
              {fetchError ? <Text style={styles.error}>{fetchError}</Text> : null}
              {visiblePresets.map((preset) => (
                <Pressable
                  key={preset.file}
                  onPress={() => void handleSelectPreset(preset.file)}
                  disabled={fetchingPreset !== null}
                  style={styles.presetRow}
                >
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetMeta}>
                    {fetchingPreset === preset.file ? "取得中…" : `${preset.itemCount}品`}
                  </Text>
                </Pressable>
              ))}
              {RESTAURANT_PRESET_LIST.length > PRESET_VISIBLE ? (
                <Pressable
                  onPress={() => setPresetExpanded((e) => !e)}
                  style={styles.expandHint}
                >
                  <Text style={styles.expandHintText}>
                    {presetExpanded
                      ? "▲ 折り畳む"
                      : `▼ さらに${RESTAURANT_PRESET_LIST.length - PRESET_VISIBLE}件表示`}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
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
    maxHeight: "88%",
    paddingBottom: 20,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4b5563",
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  /** Web のドロワー同様: 左スペーサ＋中央タイトル＋右上「キャンセル」、左右同幅でタイトル中心 */
  headerBarLeft: {
    minWidth: 72,
    maxWidth: 88,
  },
  headerBarRight: {
    minWidth: 72,
    maxWidth: 88,
    alignItems: "flex-end",
    paddingRight: 4,
    justifyContent: "center",
  },
  headerCancelHit: { paddingVertical: 2 },
  headerCancelText: { color: COLORS.textMuted, fontSize: 14 },
  title: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  section: { padding: 16 },
  scroll: { maxHeight: 420, paddingHorizontal: 16, paddingTop: 8 },
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
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  catChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    minWidth: "45%",
    flexGrow: 1,
  },
  catChipActive: { backgroundColor: "#059669" },
  catChipText: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", fontWeight: "600" },
  catChipTextActive: { color: "#fff" },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 10 },
  saveBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  saveBtnText: { color: "#022c22", fontWeight: "700", fontSize: 16 },
  choiceBtn: {
    backgroundColor: COLORS.card,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  choiceBtnText: { color: COLORS.text, fontSize: 15, fontWeight: "600", textAlign: "center" },
  fileBtn: {
    backgroundColor: "#374151",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  fileBtnText: { color: COLORS.text, fontSize: 15, fontWeight: "600", textAlign: "center" },
  secondaryBtn: {
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  secondaryBtnText: { color: COLORS.textMuted, fontSize: 14, textAlign: "center" },
  previewBox: { backgroundColor: COLORS.card, borderRadius: 8, padding: 12, marginBottom: 12 },
  previewName: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  previewMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  presetName: { color: COLORS.text, fontSize: 14, flex: 1 },
  presetMeta: { color: COLORS.textMuted, fontSize: 12 },
  expandHint: { paddingVertical: 8 },
  expandHintText: { color: COLORS.textMuted, fontSize: 12, textAlign: "center" },
});
