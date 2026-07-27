import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
import {
  addPhaseSlot,
  canAddPhaseSlot,
  isPhaseSlotUsed,
  normalizeUserSettings,
  removePhaseSlot,
  resolveActiveDietPhase,
  usedPhaseSlots,
  type DietPhase,
  type PhaseProfiles,
} from "@ketolog/domain/diet-phase";
import { snapshotSourceForSettingsChangeWithRepair } from "@ketolog/domain/pfc-target-snapshot";
import { toJstDateString } from "@ketolog/domain/date";
import { writePfcTargetSnapshot } from "../lib/pfc-target-snapshot-write";

import {
  buildFullDataExportPayload,
  fetchFoodLogForExportMobile,
  type MenuItemExportRow,
  type RestaurantExportRow,
} from "../lib/export-full-user-data-mobile";
import { LegalDocumentLinks } from "./LegalDocumentLinks";
import { ClaudeIntegrationSection } from "./ClaudeIntegrationSection";
import { isSnapshotRestaurant } from "../lib/snapshot-restaurant";
import { shareUtf8JsonFile } from "../lib/share-json-mobile";

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
  for (const ph of usedPhaseSlots(base)) {
    const pk = String(ph) as keyof PhaseProfiles;
    const current = result[pk];
    if (!current) continue;
    for (const macro of PFC_MACRO_TARGET_KEYS) {
      const dkey = pfcTargetDraftKey(ph, macro);
      if (!Object.prototype.hasOwnProperty.call(drafts, dkey)) continue;
      const nextVal = committedPfcGramsFromDraft(drafts[dkey]!, current[macro]);
      result = {
        ...result,
        [pk]: { ...current, [macro]: nextVal },
      };
    }
  }
  return result;
}

function roundPhaseProfile(pr: NonNullable<PhaseProfiles[keyof PhaseProfiles]>) {
  return {
    ...pr,
    name: pr.name.trim(),
    protein_target_g: Math.round(pr.protein_target_g),
    fat_target_g: Math.round(pr.fat_target_g),
    carbs_target_g: Math.round(pr.carbs_target_g),
  };
}

function buildNormalizedPhaseProfiles(merged: PhaseProfiles): PhaseProfiles | { error: string } {
  const normalized: PhaseProfiles = {
    "1": roundPhaseProfile(merged["1"]),
    "2": roundPhaseProfile(merged["2"]),
    "3": roundPhaseProfile(merged["3"]),
  };
  for (const ph of usedPhaseSlots(merged)) {
    if (ph <= 3) continue;
    const pr = merged[String(ph) as "4" | "5"];
    if (!pr) continue;
    normalized[String(ph) as "4" | "5"] = roundPhaseProfile(pr);
  }
  for (const ph of usedPhaseSlots(normalized)) {
    const pr = normalized[String(ph) as keyof PhaseProfiles]!;
    if (
      !Number.isFinite(pr.protein_target_g) ||
      !Number.isFinite(pr.fat_target_g) ||
      !Number.isFinite(pr.carbs_target_g) ||
      pr.protein_target_g <= 0 ||
      pr.fat_target_g <= 0 ||
      pr.carbs_target_g <= 0
    ) {
      return { error: "各セットの PFC は正の数値にしてください" };
    }
    if (!pr.name.trim()) {
      return { error: "各セットの名前を入力してください" };
    }
  }
  return normalized;
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
  const router = useRouter();
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

  const slotRows = usedPhaseSlots(profiles);
  const canAddSlot = canAddPhaseSlot(profiles);

  const selectSlot = useCallback(
    async (next: DietPhase) => {
      if (next === selectedSlot) return;
      if (!isPhaseSlotUsed(settings.phase_profiles, next)) {
        setError("先に「目標を保存する」でセットを保存してください");
        return;
      }
      setSlotSaving(true);
      setError(null);
      const { data: existing } = await supabase
        .from("user_settings")
        .select("diet_phase, phase_profiles")
        .eq("user_id", userId)
        .maybeSingle();
      const rawDietPhaseFromDb = existing?.diet_phase;
      const prev = normalizeUserSettings(existing ?? settings);
      const phase_profiles = settings.phase_profiles;
      const diet_phase = resolveActiveDietPhase(next, phase_profiles);
      const nextSettings = { diet_phase, phase_profiles };
      const { error: upErr } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          diet_phase,
          phase_profiles,
        },
        { onConflict: "user_id" }
      );
      setSlotSaving(false);
      if (upErr) {
        setError(upErr.message);
        return;
      }
      setSelectedSlot(diet_phase);
      onSettingsUpdated(nextSettings);
      const source = snapshotSourceForSettingsChangeWithRepair({
        prev,
        next: nextSettings,
        rawDietPhaseFromDb,
      });
      if (source) {
        void writePfcTargetSnapshot(supabase, {
          userId,
          date: toJstDateString(),
          settings: nextSettings,
          source,
        });
      }
    },
    [selectedSlot, supabase, userId, onSettingsUpdated, settings]
  );

  const handleAddSlot = useCallback(() => {
    const active =
      profiles[String(selectedSlot) as keyof PhaseProfiles] ?? profiles["1"];
    setProfiles((prev) =>
      addPhaseSlot(prev, {
        protein_target_g: active.protein_target_g,
        fat_target_g: active.fat_target_g,
        carbs_target_g: active.carbs_target_g,
      })
    );
    setError(null);
  }, [profiles, selectedSlot]);

  const handleRemoveSlot = useCallback(
    (phase: DietPhase) => {
      if (phase <= 3) return;
      Alert.alert(
        "セットを削除",
        "このセットを削除しますか？保存すると反映されます。過去の記録の達成率には影響しません。",
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: () => {
              setProfiles((prev) => removePhaseSlot(prev, phase));
              setPfcTargetDrafts((drafts) => {
                const next = { ...drafts };
                for (const macro of PFC_MACRO_TARGET_KEYS) {
                  delete next[pfcTargetDraftKey(phase, macro)];
                }
                return next;
              });
              if (selectedSlot === phase) setSelectedSlot(1);
              setError(null);
            },
          },
        ]
      );
    },
    [selectedSlot]
  );

  const handleSaveProfiles = useCallback(async () => {
    const mergedProfiles = mergePfcTargetDraftsIntoProfiles(profiles, pfcTargetDrafts);
    const built = buildNormalizedPhaseProfiles(mergedProfiles);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    const normalized = built;
    const nextDietPhase = isPhaseSlotUsed(normalized, selectedSlot) ? selectedSlot : 1;
    setPfcTargetDrafts({});
    setProfiles(normalized);
    setSelectedSlot(nextDietPhase);
    setSaving(true);
    setError(null);

    const { data: existing } = await supabase
      .from("user_settings")
      .select("diet_phase, phase_profiles")
      .eq("user_id", userId)
      .maybeSingle();
    const rawDietPhaseFromDb = existing?.diet_phase;
    const prev = normalizeUserSettings(existing ?? settings);
    const diet_phase = resolveActiveDietPhase(nextDietPhase, normalized);
    const nextSettings = { diet_phase, phase_profiles: normalized };

    const { error: upErr } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        diet_phase,
        phase_profiles: normalized,
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    onSettingsUpdated(nextSettings);
    const source = snapshotSourceForSettingsChangeWithRepair({
      prev,
      next: nextSettings,
      rawDietPhaseFromDb,
    });
    if (source) {
      void writePfcTargetSnapshot(supabase, {
        userId,
        date: toJstDateString(),
        settings: nextSettings,
        source,
      });
    }
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
    settings,
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
            <Text style={styles.sectionHint}>
              最大5つまで追加できます。追加したセットは「目標を保存する」まで選べません。
            </Text>

            {slotRows.map((ph) => {
              const pk = String(ph) as keyof PhaseProfiles;
              const pr = profiles[pk];
              if (!pr) return null;
              const selected = selectedSlot === ph;
              const selectionLocked = !isPhaseSlotUsed(settings.phase_profiles, ph);
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
                      disabled={slotSaving || selectionLocked}
                      style={({ pressed }) => [
                        styles.slotRadioHit,
                        pressed && { opacity: 0.85 },
                        (slotSaving || selectionLocked) && { opacity: 0.5 },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: selectionLocked }}
                      accessibilityLabel={
                        selectionLocked
                          ? "保存するとこのセットを選べます"
                          : "このセットを表示中の目標にする"
                      }
                    >
                      <View style={[styles.slotRadioOuter, selected && styles.slotRadioOuterOn]}>
                        {selected ? <View style={styles.slotRadioDot} /> : null}
                      </View>
                    </Pressable>
                    <TextInput
                      value={pr.name}
                      onChangeText={(t) =>
                        setProfiles((prev) => {
                          const current = prev[pk];
                          if (!current) return prev;
                          return {
                            ...prev,
                            [pk]: { ...current, name: t.slice(0, 48) },
                          };
                        })
                      }
                      maxLength={48}
                      placeholder="セット名"
                      placeholderTextColor="#6b7280"
                      style={styles.phaseNameInput}
                      accessibilityLabel="セット名"
                    />
                    {ph >= 4 ? (
                      <Pressable
                        onPress={() => handleRemoveSlot(ph)}
                        hitSlop={8}
                        accessibilityLabel="このセットを削除"
                      >
                        <Text style={styles.deleteSlot}>削除</Text>
                      </Pressable>
                    ) : null}
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
                                    const current = prev[pk];
                                    if (!current) return prev;
                                    const nextVal = committedPfcGramsFromDraft(raw, current[key]);
                                    return { ...prev, [pk]: { ...current, [key]: nextVal } };
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

            {canAddSlot ? (
              <Pressable
                onPress={handleAddSlot}
                disabled={saving || slotSaving}
                style={({ pressed }) => [
                  styles.addSlotBtn,
                  (saving || slotSaving) && { opacity: 0.5 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.addSlotBtnText}>＋ セットを追加</Text>
              </Pressable>
            ) : null}

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
              Web 版と同様、過去7日・30日・カスタム期間の集計・グラフ・Top10 を専用画面で開けます。
            </Text>
            <Pressable
              onPress={() => {
                onClose();
                router.push("/(app)/insights");
              }}
              style={({ pressed }) => [
                styles.insightsOpenBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.insightsOpenBtnText}>分析画面を開く</Text>
            </Pressable>

            <ClaudeIntegrationSection />

            <Text style={[styles.sectionTitle, { marginTop: 22 }]}>データソース</Text>
            <Text style={styles.sectionHint}>
              市販品データは Open Food Facts を利用しています（ODbL）。{" "}
              <Text onPress={openOff} style={styles.link}>
                Open Food Facts
              </Text>
            </Text>

            <LegalDocumentLinks
              variant="settings"
              onOpenError={(m) => onToast?.(m)}
            />

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
  pfcSectionTitle: { marginBottom: 6 },
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
  deleteSlot: { color: "#f87171", fontSize: 12, fontWeight: "600" },
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
  addSlotBtn: {
    marginBottom: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#4b5563",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  addSlotBtnText: { color: "#d1d5db", fontSize: 13, fontWeight: "500" },
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
  insightsOpenBtn: {
    marginTop: 8,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  insightsOpenBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  link: { color: "#34d399", textDecorationLine: "underline" },
  signOut: { marginTop: 22, paddingVertical: 12, alignItems: "center" },
  signOutText: { color: "#f87171", fontSize: 14, fontWeight: "500" },
});
