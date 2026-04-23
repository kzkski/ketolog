import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DietPhase, PhaseProfiles } from "@ketolog/domain/diet-phase";

import {
  buildFullDataExportPayload,
  fetchFoodLogForExportMobile,
  type MenuItemExportRow,
  type RestaurantExportRow,
} from "../lib/export-full-user-data-mobile";
import { isSnapshotRestaurant } from "../lib/snapshot-restaurant";
import { shareUtf8JsonFile } from "../lib/share-json-mobile";

const DIET_PHASES: DietPhase[] = [1, 2, 3];

const PFC_MACRO_TARGET_KEYS = [
  "protein_target_g",
  "fat_target_g",
  "carbs_target_g",
] as const;

type PfcMacroTargetKey = (typeof PFC_MACRO_TARGET_KEYS)[number];

function pfcTargetDraftKey(phase: DietPhase, macro: PfcMacroTargetKey): string {
  return `${phase}:${macro}`;
}

function committedPfcGramsFromDraft(raw: string, fallback: number): number {
  const t = raw.trim();
  if (t === "") return fallback;
  const v = Number.parseFloat(t);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.round(v));
}

function mergePfcTargetDraftsIntoProfiles(
  base: PhaseProfiles,
  drafts: Record<string, string>
): PhaseProfiles {
  let result = base;
  for (const ph of DIET_PHASES) {
    const pk = String(ph) as keyof PhaseProfiles;
    for (const macro of PFC_MACRO_TARGET_KEYS) {
      const dkey = pfcTargetDraftKey(ph, macro);
      if (!Object.prototype.hasOwnProperty.call(drafts, dkey)) continue;
      const nextVal = committedPfcGramsFromDraft(drafts[dkey]!, result[pk][macro]);
      result = {
        ...result,
        [pk]: { ...result[pk], [macro]: nextVal },
      };
    }
  }
  return result;
}

export type UserSettingsModalState = {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  userId: string;
  settings: UserSettingsModalState;
  onSettingsUpdated: (next: UserSettingsModalState) => void;
  onToast?: (message: string) => void;
  onSignOut: () => void;
};

/** Web `SettingsDrawer` の PFC 目標セット・全データエクスポート・ログアウトに相当 */
export function TodaySettingsModal({
  visible,
  onClose,
  supabase,
  userId,
  settings,
  onSettingsUpdated,
  onToast,
  onSignOut,
}: Props) {
  const [profiles, setProfiles] = useState<PhaseProfiles>(settings.phase_profiles);
  const [selectedSlot, setSelectedSlot] = useState<DietPhase>(settings.diet_phase);
  const [pfcTargetDrafts, setPfcTargetDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slotSaving, setSlotSaving] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllError, setExportAllError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setProfiles(JSON.parse(JSON.stringify(settings.phase_profiles)) as PhaseProfiles);
    setSelectedSlot(settings.diet_phase);
    setPfcTargetDrafts({});
    setError(null);
    setExportAllError(null);
  }, [visible, settings]);

  const selectSlot = useCallback(
    async (next: DietPhase) => {
      if (next === selectedSlot) return;
      setSlotSaving(true);
      setError(null);
      const { error: upErr } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          diet_phase: next,
          phase_profiles: profiles,
        },
        { onConflict: "user_id" }
      );
      setSlotSaving(false);
      if (upErr) {
        setError(upErr.message);
        return;
      }
      setSelectedSlot(next);
      onSettingsUpdated({ diet_phase: next, phase_profiles: profiles });
    },
    [selectedSlot, supabase, userId, profiles, onSettingsUpdated]
  );

  const handleSaveProfiles = useCallback(async () => {
    const mergedProfiles = mergePfcTargetDraftsIntoProfiles(profiles, pfcTargetDrafts);
    for (const ph of DIET_PHASES) {
      const pk = String(ph) as keyof PhaseProfiles;
      const pr = mergedProfiles[pk];
      if (
        !Number.isFinite(pr.protein_target_g) ||
        !Number.isFinite(pr.fat_target_g) ||
        !Number.isFinite(pr.carbs_target_g) ||
        pr.protein_target_g <= 0 ||
        pr.fat_target_g <= 0 ||
        pr.carbs_target_g <= 0
      ) {
        setError("各セットの PFC は正の数値にしてください");
        return;
      }
      if (!pr.name.trim()) {
        setError("各セットの名前を入力してください");
        return;
      }
    }
    const normalized: PhaseProfiles = {
      "1": {
        ...mergedProfiles["1"],
        name: mergedProfiles["1"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["1"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["1"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["1"].carbs_target_g),
      },
      "2": {
        ...mergedProfiles["2"],
        name: mergedProfiles["2"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["2"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["2"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["2"].carbs_target_g),
      },
      "3": {
        ...mergedProfiles["3"],
        name: mergedProfiles["3"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["3"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["3"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["3"].carbs_target_g),
      },
    };
    setPfcTargetDrafts({});
    setProfiles(normalized);
    setSaving(true);
    setError(null);
    const { error: upErr } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        diet_phase: selectedSlot,
        phase_profiles: normalized,
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    onSettingsUpdated({ diet_phase: selectedSlot, phase_profiles: normalized });
    onToast?.("目標を保存しました");
    onClose();
  }, [
    profiles,
    pfcTargetDrafts,
    supabase,
    userId,
    selectedSlot,
    onSettingsUpdated,
    onClose,
    onToast,
  ]);

  const handleDownloadFullData = useCallback(async () => {
    setExportAllError(null);
    setExportingAll(true);
    try {
      const [{ data: restRows, error: rErr }, { data: miRows, error: miErr }, logRes] =
        await Promise.all([
          supabase.from("restaurants").select("id, name, category").eq("user_id", userId),
          supabase
            .from("menu_items")
            .select(
              "restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, shared_barcode, standard_food_code, default_grams, rank, notes, group_name"
            )
            .eq("user_id", userId),
          fetchFoodLogForExportMobile(supabase, userId),
        ]);
      if (rErr) {
        setExportAllError(rErr.message);
        return;
      }
      if (miErr) {
        setExportAllError(miErr.message);
        return;
      }
      if (logRes.error) {
        setExportAllError(logRes.error);
        return;
      }
      const restaurants = ((restRows ?? []) as RestaurantExportRow[]).filter(
        (r) => !isSnapshotRestaurant(r)
      );
      const menuItems = (miRows ?? []) as MenuItemExportRow[];
      const payload = buildFullDataExportPayload(restaurants, menuItems, logRes.entries);
      const fname = `ketolog-all-${payload.exportedAt}.json`;
      const share = await shareUtf8JsonFile(fname, JSON.stringify(payload, null, 2));
      if (share.error) {
        setExportAllError(share.error);
        return;
      }
      onToast?.("共有シートから保存または送信できます");
    } finally {
      setExportingAll(false);
    }
  }, [supabase, userId, onToast]);

  const openOff = useCallback(() => {
    void Linking.openURL("https://world.openfoodfacts.org");
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>設定</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>閉じる</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.sectionTitle, styles.pfcSectionTitle]}>PFC 目標セット</Text>

            {DIET_PHASES.map((ph) => {
              const pk = String(ph) as keyof PhaseProfiles;
              const pr = profiles[pk];
              const selected = selectedSlot === ph;
              return (
                <View
                  key={ph}
                  style={[styles.phaseCard, selected ? styles.phaseCardOn : styles.phaseCardOff]}
                >
                  <View style={styles.phaseHeaderRow}>
                    <Pressable
                      onPress={() => {
                        void selectSlot(ph);
                      }}
                      disabled={slotSaving}
                      style={({ pressed }) => [
                        styles.slotRadioHit,
                        pressed && { opacity: 0.85 },
                        slotSaving && { opacity: 0.5 },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel="このセットを表示中の目標にする"
                    >
                      <View style={[styles.slotRadioOuter, selected && styles.slotRadioOuterOn]}>
                        {selected ? <View style={styles.slotRadioDot} /> : null}
                      </View>
                    </Pressable>
                    <TextInput
                      value={pr.name}
                      onChangeText={(t) =>
                        setProfiles((prev) => ({
                          ...prev,
                          [pk]: { ...prev[pk], name: t.slice(0, 48) },
                        }))
                      }
                      maxLength={48}
                      placeholder="セット名"
                      placeholderTextColor="#6b7280"
                      style={styles.phaseNameInput}
                      accessibilityLabel="セット名"
                    />
                  </View>
                  <View style={styles.pfcGrid}>
                    {(
                      [
                        { key: "protein_target_g" as const, short: "P", color: "#60a5fa" },
                        { key: "fat_target_g" as const, short: "F", color: "#facc15" },
                        { key: "carbs_target_g" as const, short: "C", color: "#34d399" },
                      ] as const
                    ).map(({ key, short, color }) => {
                      const dkey = pfcTargetDraftKey(ph, key);
                      const displayVal = Object.prototype.hasOwnProperty.call(pfcTargetDrafts, dkey)
                        ? pfcTargetDrafts[dkey]!
                        : String(pr[key]);
                      return (
                        <View key={key} style={styles.pfcCell}>
                          <Text style={[styles.pfcShort, { color }]}>{short}</Text>
                          <View style={styles.pfcInputRow}>
                            <TextInput
                              value={displayVal}
                              onChangeText={(t) =>
                                setPfcTargetDrafts((prev) => ({ ...prev, [dkey]: t }))
                              }
                              onBlur={() => {
                                setPfcTargetDrafts((drafts) => {
                                  if (!Object.prototype.hasOwnProperty.call(drafts, dkey)) {
                                    return drafts;
                                  }
                                  const raw = drafts[dkey]!;
                                  setProfiles((prev) => {
                                    const current = prev[pk][key];
                                    const nextVal = committedPfcGramsFromDraft(raw, current);
                                    return { ...prev, [pk]: { ...prev[pk], [key]: nextVal } };
                                  });
                                  const rest = { ...drafts };
                                  delete rest[dkey];
                                  return rest;
                                });
                              }}
                              keyboardType="number-pad"
                              style={styles.pfcInput}
                            />
                            <Text style={styles.pfcG}>g</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {error ? <Text style={styles.err}>{error}</Text> : null}
            <Pressable
              onPress={() => {
                void handleSaveProfiles();
              }}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                saving && { opacity: 0.5 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.saveBtnText}>{saving ? "保存中..." : "目標を保存する"}</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { marginTop: 22 }]}>データエクスポート</Text>
            <Text style={styles.sectionHint}>
              メニュータブ等の「お店」とメニューに加え、これまでの食事ログ（全期間）をまとめてエクスポートします。内部用のスナップショット記録のお店と、その店のメニューは含みません。
            </Text>
            {exportAllError ? <Text style={styles.err}>{exportAllError}</Text> : null}
            <Pressable
              onPress={() => {
                void handleDownloadFullData();
              }}
              disabled={exportingAll}
              style={({ pressed }) => [
                styles.exportBtn,
                exportingAll && { opacity: 0.5 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.exportBtnText}>
                {exportingAll ? "取得中..." : "全データをJSONでダウンロード"}
              </Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { marginTop: 22 }]}>分析</Text>
            <Text style={styles.sectionHint}>
              過去7日・30日・カスタム期間の食事ログの集計は、Web 版 Ketolog の分析画面から利用できます。
            </Text>

            <Text style={[styles.sectionTitle, { marginTop: 22 }]}>データソース</Text>
            <Text style={styles.sectionHint}>
              市販品データは Open Food Facts を利用しています（ODbL）。{" "}
              <Text onPress={openOff} style={styles.link}>
                Open Food Facts
              </Text>
            </Text>

            <Pressable
              onPress={() => {
                onClose();
                onSignOut();
              }}
              style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.signOutText}>ログアウト</Text>
            </Pressable>
          </ScrollView>
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
    position: "relative",
  },
  sheet: {
    maxHeight: Platform.OS === "ios" ? "82%" : "88%",
    backgroundColor: "#111827",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#374151",
    paddingBottom: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4b5563",
    marginTop: 10,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2937",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  close: { color: "#9ca3af", fontSize: 14 },
  scroll: { maxHeight: "100%" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  pfcSectionTitle: { marginBottom: 10 },
  sectionHint: { color: "#6b7280", fontSize: 11, lineHeight: 16, marginBottom: 10 },
  phaseCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  phaseCardOn: { borderColor: "rgba(16, 185, 129, 0.55)", backgroundColor: "rgba(6, 78, 59, 0.22)" },
  phaseCardOff: { borderColor: "#374151", backgroundColor: "rgba(31, 41, 55, 0.35)" },
  phaseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  slotRadioHit: { padding: 4, marginLeft: -4 },
  slotRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#6b7280",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  slotRadioOuterOn: {
    borderColor: "#34d399",
  },
  slotRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34d399",
  },
  phaseNameInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#4b5563",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    color: "#f9fafb",
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "#030712",
  },
  pfcGrid: { flexDirection: "row", gap: 6 },
  pfcCell: { flex: 1, minWidth: 0 },
  pfcShort: { fontSize: 10, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  pfcInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4b5563",
    borderRadius: 8,
    backgroundColor: "#030712",
    paddingHorizontal: 4,
  },
  pfcInput: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 13,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    textAlign: "center",
  },
  pfcG: { color: "#6b7280", fontSize: 10, paddingRight: 4 },
  err: { color: "#fecaca", fontSize: 12, marginTop: 8, marginBottom: 4 },
  saveBtn: {
    marginTop: 10,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  exportBtn: {
    marginTop: 6,
    backgroundColor: "#374151",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  exportBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  link: { color: "#34d399", textDecorationLine: "underline" },
  signOut: { marginTop: 22, paddingVertical: 12, alignItems: "center" },
  signOutText: { color: "#f87171", fontSize: 14, fontWeight: "500" },
});
