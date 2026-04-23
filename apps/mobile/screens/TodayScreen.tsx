import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { sumPfc, type PfcGrams } from "@ketolog/domain/pfc";
import { toJstDateString } from "@ketolog/domain/date";
import {
  type DietPhase,
  type PhaseProfiles,
  activePhaseProfile,
  normalizeUserSettings,
} from "@ketolog/domain/diet-phase";
import { getSupabase } from "../lib/supabase";

type UserSettingsState = {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
};

const DIET_PHASES: DietPhase[] = [1, 2, 3];

const COLORS = {
  bg: "#0a0a0a",
  headerBorder: "#1f2937",
  sectionBg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  p: "#3b82f6",
  f: "#eab308",
  c: "#10b981",
  over: "#ef4444",
  phaseOnBorder: "#10b981",
  phaseOnBg: "rgba(6, 78, 59, 0.5)",
  phaseOnText: "#d1fae5",
  phaseOffBorder: "#374151",
  phaseOffBg: "rgba(31, 41, 55, 0.6)",
  phaseOffText: "#9ca3af",
};

function fmtMacroGrams(n: number) {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

function PfcBarRow({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const over = current > target;
  const widthPct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <View style={styles.pfcRow}>
      <Text style={styles.pfcLabel}>{label}</Text>
      <View style={styles.pfcBarTrack}>
        <View
          style={[
            styles.pfcBarFill,
            {
              width: `${widthPct}%`,
              backgroundColor: over ? COLORS.over : color,
            },
          ]}
        />
      </View>
      <Text
        style={[styles.pfcValue, over && { color: "#fca5a5" }]}
        numberOfLines={1}
      >{`${fmtMacroGrams(current)} / ${target}g`}</Text>
    </View>
  );
}

type TodayScreenProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

export function TodayScreen({ session, onSignOut }: TodayScreenProps) {
  const userId = session.user.id;
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettingsState | null>(null);
  const [consumed, setConsumed] = useState<PfcGrams>({ p: 0, f: 0, c: 0 });
  const [jstDate, setJstDate] = useState(() => toJstDateString());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phaseSaving, setPhaseSaving] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "—";

  const load = useCallback(async () => {
    setLoadError(null);
    const today = toJstDateString();
    setJstDate(today);

    const [settingsRes, logRes] = await Promise.all([
      supabase
        .from("user_settings")
        .select("diet_phase, phase_profiles")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("food_log")
        .select("protein_g, fat_g, carbs_g")
        .eq("user_id", userId)
        .eq("date", today),
    ]);

    if (settingsRes.error) {
      setLoadError(settingsRes.error.message);
      return;
    }
    if (logRes.error) {
      setLoadError(logRes.error.message);
      return;
    }

    setSettings(normalizeUserSettings(settingsRes.data));
    const rows = logRes.data ?? [];
    setConsumed(
      sumPfc(
        ...rows.map((r) => ({
          p: Number(r.protein_g) || 0,
          f: Number(r.fat_g) || 0,
          c: Number(r.carbs_g) || 0,
        }))
      )
    );
  }, [supabase, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onSelectPhase = useCallback(
    async (ph: DietPhase) => {
      if (!settings || ph === settings.diet_phase) return;
      setPhaseSaving(true);
      setLoadError(null);
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          diet_phase: ph,
          phase_profiles: settings.phase_profiles,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        setLoadError(error.message);
      } else {
        setSettings((s) => (s ? { ...s, diet_phase: ph } : s));
      }
      setPhaseSaving(false);
    },
    [settings, supabase, userId]
  );

  const activeProfile = settings
    ? activePhaseProfile(settings)
    : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={COLORS.c} />
          <Text style={styles.loadingHint}>今日の記録を読み込んでいます…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!settings || !activeProfile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centeredFill}>
          <Text style={styles.errorTitle}>表示できません</Text>
          {loadError ? <Text style={styles.errorMsg}>{loadError}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.topHeader}>
          <View style={styles.brandBlock}>
            <View style={styles.brandIconWrap} accessibilityLabel="Ketolog">
              <Image
                source={require("../assets/brand-header.png")}
                style={styles.brandIconImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View>
              <Text style={styles.brandName}>Ketolog</Text>
              <Text style={styles.brandSub}>v{appVersion} · 記録（JST {jstDate}）</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityLabel="設定"
          >
            <Ionicons name="settings-outline" size={24} color={COLORS.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loadError ? <Text style={styles.inlineError}>{loadError}</Text> : null}

          <View style={styles.phaseRow}>
            {DIET_PHASES.map((ph) => {
              const pr = settings.phase_profiles[String(ph) as keyof PhaseProfiles];
              const on = settings.diet_phase === ph;
              return (
                <Pressable
                  key={ph}
                  onPress={() => {
                    void onSelectPhase(ph);
                  }}
                  disabled={phaseSaving}
                  style={({ pressed }) => [
                    styles.phaseBtn,
                    on ? styles.phaseBtnOn : styles.phaseBtnOff,
                    pressed && { opacity: 0.85 },
                    phaseSaving && { opacity: 0.5 },
                  ]}
                >
                  <Text
                    style={on ? styles.phaseBtnTextOn : styles.phaseBtnTextOff}
                    numberOfLines={1}
                  >
                    {pr.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.pfcBlock}>
            <PfcBarRow
              label="P"
              current={consumed.p}
              target={activeProfile.protein_target_g}
              color={COLORS.p}
            />
            <PfcBarRow
              label="F"
              current={consumed.f}
              target={activeProfile.fat_target_g}
              color={COLORS.f}
            />
            <PfcBarRow
              label="C"
              current={consumed.c}
              target={activeProfile.carbs_target_g}
              color={COLORS.c}
            />
          </View>

          <View style={styles.mvpBox}>
            <Text style={styles.mvpTitle}>MVP 表示中</Text>
            <Text style={styles.mvpBody}>
              メニュー・カート・食事記録の追加・編集は、引き続き Web 版（PWA）をご利用ください。アプリは Web
              で記録した内容と同じ Supabase 上の日次合計（上記 PFC）を表示します。
            </Text>
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsOpen(false)}
            accessibilityLabel="閉じる"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>設定</Text>
            <Text style={styles.modalBody}>
              PFC 目標の編集・データのエクスポート・全データ管理は、Web 版の Ketolog を開いて行ってください。
            </Text>
            <Pressable
              onPress={() => {
                setSettingsOpen(false);
                void onSignOut();
              }}
              style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.dangerBtnText}>ログアウト</Text>
            </Pressable>
            <Pressable
              onPress={() => setSettingsOpen(false)}
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.outlineBtnText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  root: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 32,
  },
  centeredFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingHint: {
    marginTop: 12,
    color: COLORS.textMuted,
    fontSize: 14,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
  },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
    backgroundColor: "#0f172a",
  },
  brandIconImage: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  brandSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  iconBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
  },
  phaseBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  phaseBtnOn: {
    borderColor: COLORS.phaseOnBorder,
    backgroundColor: COLORS.phaseOnBg,
  },
  phaseBtnOff: {
    borderColor: COLORS.phaseOffBorder,
    backgroundColor: COLORS.phaseOffBg,
  },
  phaseBtnTextOn: { color: COLORS.phaseOnText, fontSize: 11, fontWeight: "600" },
  phaseBtnTextOff: { color: COLORS.phaseOffText, fontSize: 11, fontWeight: "500" },
  pfcBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.headerBorder,
    gap: 6,
  },
  pfcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pfcLabel: {
    width: 12,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  pfcBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#1f2937",
    borderRadius: 3,
    overflow: "hidden",
  },
  pfcBarFill: { height: "100%", borderRadius: 3 },
  pfcValue: {
    width: 80,
    fontSize: 11,
    textAlign: "right",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  mvpBox: {
    margin: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
  },
  mvpTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 8,
  },
  mvpBody: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 },
  inlineError: {
    color: "#fecaca",
    fontSize: 12,
    marginHorizontal: 12,
    marginTop: 8,
  },
  errorTitle: { color: "#fecaca", fontSize: 16, fontWeight: "600" },
  errorMsg: { color: COLORS.text, marginTop: 8, textAlign: "center" },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { color: COLORS.text, fontSize: 17, fontWeight: "600" },
  modalBody: { color: COLORS.textMuted, fontSize: 13, marginTop: 10, lineHeight: 20 },
  dangerBtn: {
    marginTop: 18,
    backgroundColor: "#7f1d1d",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerBtnText: { color: "#fecaca", fontWeight: "600" },
  outlineBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.headerBorder,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  outlineBtnText: { color: COLORS.text, fontWeight: "500" },
});
