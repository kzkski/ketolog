import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { toJstDateString } from "@ketolog/domain/date";
import type { OwnBarcodeMenuMatch } from "@ketolog/domain/barcode-menu-prefill";
import type { MealType } from "@ketolog/types";

import { MenuBarcodeSection } from "../../../components/MenuBarcodeSection";
import { BarcodeQuickConfirmSheet } from "../../../components/BarcodeQuickConfirmSheet";
import { useAuthSessionContext } from "../../../contexts/AuthSessionContext";
import { useBarcodeScanLookup } from "../../../hooks/useBarcodeScanLookup";
import { getOrCreateSnapshotRestaurant } from "../../../lib/get-or-create-snapshot-restaurant";
import {
  buildQuickBarcodeFoodLogDraft,
  persistQuickBarcodeFoodLog,
} from "../../../lib/quick-barcode-food-log";
import { getSupabase } from "../../../lib/supabase";

const COLORS = {
  bg: "#0a0a0a",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  danger: "#ef4444",
};

export default function ScanBarcodeScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuthSessionContext();
  const userId = session?.user?.id ?? "";
  const supabase = useMemo(() => getSupabase(), []);

  const { scanLoading, scanError, setScanError, result, lookupBarcode, resetForRescan } =
    useBarcodeScanLookup(supabase, userId);

  const [cameraOn, setCameraOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [snapshotRestaurantId, setSnapshotRestaurantId] = useState<string | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);

  const prefill = result?.lookup.prefill ?? null;
  const isNotFound =
    result != null && (result.lookup.status === "not_found" || !result.lookup.prefill);
  const confirmVisible = Boolean(prefill && !isNotFound);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void (async () => {
      const { data, error } = await getOrCreateSnapshotRestaurant(supabase, userId);
      if (error || !data?.id) {
        setSnapshotLoadError(error ?? "スナップショット店舗を準備できませんでした");
        return;
      }
      setSnapshotRestaurantId(data.id);
    })();
  }, [authLoading, supabase, userId]);

  const onBarcodeData = useCallback(
    async (raw: string) => {
      setCameraOn(false);
      await lookupBarcode(raw);
    },
    [lookupBarcode]
  );

  const handleRescan = useCallback(() => {
    resetForRescan();
    setScanError(null);
    setCameraOn(true);
  }, [resetForRescan, setScanError]);

  const goToday = useCallback(() => {
    router.replace("/(app)/today");
  }, [router]);

  const handleConfirm = useCallback(
    async (input: {
      mealType: MealType;
      grams: number;
      selectedOwnMenu: OwnBarcodeMenuMatch | null;
    }) => {
      if (!prefill || !userId) return;
      const needsSnapshot = prefill.source !== "own_menu_item";
      if (needsSnapshot && !snapshotRestaurantId) {
        setScanError(snapshotLoadError ?? "記録用の店舗情報を読み込めていません。");
        return;
      }

      const draft = buildQuickBarcodeFoodLogDraft({
        prefill,
        selectedOwnMenu: input.selectedOwnMenu,
        snapshotRestaurantId: snapshotRestaurantId ?? "",
        grams: input.grams,
        mealType: input.mealType,
        date: toJstDateString(),
      });

      setBusy(true);
      const persisted = await persistQuickBarcodeFoodLog(supabase, userId, draft);
      setBusy(false);

      if (!persisted.ok) {
        setScanError(persisted.error);
        return;
      }

      setToast(persisted.message);
      setTimeout(() => {
        router.replace("/(app)/today");
      }, 600);
    },
    [prefill, router, snapshotLoadError, snapshotRestaurantId, supabase, userId]
  );

  return (
    <>
      <Stack.Screen options={{ title: "バーコード読み取り", headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={goToday} hitSlop={8}>
            <Text style={styles.topBarLink}>Today へ戻る</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>バーコード読み取り</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {!isNotFound && !confirmVisible ? (
            <MenuBarcodeSection
              cameraOn={cameraOn}
              onToggleCamera={() => setCameraOn((v) => !v)}
              acceptQr={false}
              scanLoading={scanLoading}
              scanError={scanError}
              cameraResult={null}
              menuQrImportDone={null}
              manualSharedProductPending={false}
              sharedBarcode={result?.barcode ?? null}
              servingHint={null}
              onBarcodeData={onBarcodeData}
              onRuntimeError={(msg) => setScanError(msg)}
              onCameraClosed={() => setCameraOn(false)}
            />
          ) : null}

          {isNotFound ? (
            <View style={styles.notFoundCard}>
              <Text style={styles.notFoundTitle}>登録が見つかりませんでした</Text>
              <Text style={styles.notFoundBody}>
                このバーコードは Open Food Facts にも、あなたのメニューにも登録されていません。Today
                からメニューを追加してから記録してください。
              </Text>
              {result?.barcode ? (
                <Text style={styles.notFoundBarcode}>読み取り: {result.barcode}</Text>
              ) : null}
              <Pressable onPress={goToday} style={styles.todayCta}>
                <Text style={styles.todayCtaText}>Today でメニューを追加</Text>
              </Pressable>
              <Pressable onPress={handleRescan} style={styles.rescanLink}>
                <Text style={styles.rescanLinkText}>もう一度読み取る</Text>
              </Pressable>
            </View>
          ) : null}

          {scanError && !isNotFound && !scanLoading ? (
            <Pressable onPress={handleRescan} style={styles.rescanInline}>
              <Text style={styles.rescanLinkText}>もう一度読み取る</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {prefill && result ? (
          <BarcodeQuickConfirmSheet
            visible={confirmVisible}
            barcode={result.barcode}
            prefill={prefill}
            ownMenuItems={result.lookup.ownMenuItems}
            loading={scanLoading}
            busy={busy}
            onClose={handleRescan}
            onRescan={handleRescan}
            onConfirm={handleConfirm}
          />
        ) : null}

        {toast ? (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        <StatusBar style="light" />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topBarLink: { color: COLORS.primary, fontSize: 14, width: 100 },
  topBarTitle: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  topBarSpacer: { width: 100 },
  scroll: { padding: 16, paddingBottom: 40 },
  notFoundCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    backgroundColor: "#111827",
  },
  notFoundTitle: { color: COLORS.danger, fontSize: 16, fontWeight: "600" },
  notFoundBody: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  notFoundBarcode: { color: COLORS.textMuted, fontSize: 12 },
  todayCta: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  todayCtaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  rescanLink: { alignItems: "center", paddingVertical: 10 },
  rescanInline: { alignItems: "center", marginTop: 8 },
  rescanLinkText: { color: COLORS.textMuted, fontSize: 14 },
  toast: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: "#1f2937",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toastText: { color: COLORS.text, fontSize: 13, textAlign: "center" },
});