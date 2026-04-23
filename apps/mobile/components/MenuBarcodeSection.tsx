import { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
};

export type MenuBarcodeSectionProps = {
  cameraOn: boolean;
  onToggleCamera: () => void;
  scanLoading: boolean;
  scanError: string | null;
  cameraResult: { barcode: string; product_name: string } | null;
  menuQrImportDone: string | null;
  manualSharedProductPending: boolean;
  sharedBarcode: string | null;
  servingHint: string | null;
  onBarcodeData: (raw: string) => void | Promise<void>;
  onRuntimeError: (message: string) => void;
  onCameraClosed: () => void;
  onOpenStandardFoodSearch?: () => void;
};

export function MenuBarcodeSection({
  cameraOn,
  onToggleCamera,
  scanLoading,
  scanError,
  cameraResult,
  menuQrImportDone,
  manualSharedProductPending,
  sharedBarcode,
  servingHint,
  onBarcodeData,
  onRuntimeError,
  onCameraClosed,
  onOpenStandardFoodSearch,
}: MenuBarcodeSectionProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef<string | null>(null);

  const handleBarcode = useCallback(
    (data: string | undefined) => {
      const trimmed = data?.trim();
      if (!trimmed) return;
      if (handledRef.current === trimmed) return;
      handledRef.current = trimmed;
      onCameraClosed();
      void onBarcodeData(trimmed);
    },
    [onBarcodeData, onCameraClosed]
  );

  const toggle = useCallback(async () => {
    if (cameraOn) {
      handledRef.current = null;
      onToggleCamera();
      return;
    }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        onRuntimeError("カメラの使用が許可されていません。設定アプリから許可してください。");
        return;
      }
    }
    handledRef.current = null;
    onToggleCamera();
  }, [cameraOn, onToggleCamera, onRuntimeError, permission?.granted, requestPermission]);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => void toggle()} style={styles.scanBtn}>
        <Text style={styles.scanBtnText}>
          {cameraOn ? "■ 読み取りを停止" : "|||  バーコード / QR を読み取り"}
        </Text>
      </Pressable>

      {cameraOn && permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e"],
          }}
          onBarcodeScanned={({ data }) => {
            void handleBarcode(data);
          }}
        />
      ) : null}

      {scanLoading ? (
        <Text style={styles.emeraldSm}>読み取り結果を検索中...</Text>
      ) : null}
      {menuQrImportDone ? (
        <Text style={styles.emeraldSm}>{menuQrImportDone}</Text>
      ) : null}
      {cameraResult ? (
        <Text style={styles.emeraldSm}>
          読み取り完了: {cameraResult.product_name}（{cameraResult.barcode}）
        </Text>
      ) : null}
      {scanError ? <Text style={styles.amberSm}>{scanError}</Text> : null}
      {manualSharedProductPending && sharedBarcode ? (
        <Text style={styles.emeraldMutedSm}>
          共有に使うバーコード: {sharedBarcode}
        </Text>
      ) : null}
      {servingHint ? <Text style={styles.amberSm}>{servingHint}</Text> : null}
      <Text style={styles.footnote}>
        市販品バーコードは Open Food Facts (ODbL) を参照します。Ketolog のメニュー共有 QR も読み取れます。
      </Text>
      {onOpenStandardFoodSearch ? (
        <Pressable onPress={onOpenStandardFoodSearch} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>文科省成分表で検索</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  scanBtn: {
    width: "100%",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  scanBtnText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  camera: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  emeraldSm: { fontSize: 12, color: "#6ee7b7", lineHeight: 17 },
  emeraldMutedSm: { fontSize: 12, color: "rgba(110, 231, 183, 0.9)", lineHeight: 17 },
  amberSm: { fontSize: 12, color: "#fcd34d", lineHeight: 17 },
  footnote: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  secondaryBtn: {
    width: "100%",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  secondaryBtnText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
});
