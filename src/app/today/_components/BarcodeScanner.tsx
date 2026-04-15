"use client";

import { useEffect, useRef } from "react";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import type { SharedProduct } from "@/types/database";

export type BarcodeScannerProps = {
  cameraSupported: boolean;
  cameraOn: boolean;
  onToggleScan: () => void;
  scanLoading: boolean;
  scanError: string | null;
  cameraResult: SharedProduct | null;
  menuQrImportDone: string | null;
  manualSharedProductPending: boolean;
  sharedBarcode: string | null;
  servingHint: string | null;
  onDecoded: (raw: string) => void | Promise<void>;
  onRuntimeError: (message: string) => void;
  onCameraClosed: () => void;
  onOpenStandardFoodSearch?: () => void;
};

export function BarcodeScanner({
  cameraSupported,
  cameraOn,
  onToggleScan,
  scanLoading,
  scanError,
  cameraResult,
  menuQrImportDone,
  manualSharedProductPending,
  sharedBarcode,
  servingHint,
  onDecoded,
  onRuntimeError,
  onCameraClosed,
  onOpenStandardFoodSearch,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!cameraOn || !cameraSupported) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;

    const w = window as Window & {
      BarcodeDetector?: new () => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
      };
    };

    void (async () => {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      } catch {
        if (!stopped) {
          onRuntimeError("カメラを起動できませんでした。権限設定を確認してください。");
          onCameraClosed();
        }
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");

      try {
        await video.play();
      } catch {
        if (!stopped) {
          onRuntimeError("映像の再生を開始できませんでした。");
          onCameraClosed();
        }
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (typeof w.BarcodeDetector !== "undefined") {
        try {
          type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
          const Detector = w.BarcodeDetector as unknown as BarcodeDetectorCtor;
          let detector: InstanceType<BarcodeDetectorCtor>;
          try {
            detector = new Detector({
              formats: ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e"],
            });
          } catch {
            detector = new Detector();
          }
          while (!stopped) {
            if (!videoRef.current) break;
            try {
              const detected = await detector.detect(videoRef.current);
              const value = detected[0]?.rawValue?.trim();
              if (value) {
                onCameraClosed();
                void onDecoded(value);
                break;
              }
            } catch {
              // フレームごとの検出失敗は無視して続行
            }
            await new Promise((r) => setTimeout(r, 350));
          }
        } catch {
          if (!stopped) {
            onRuntimeError("バーコードの自動読み取りを開始できませんでした。");
            onCameraClosed();
          }
        }
      } else {
        try {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          const hints = new Map<DecodeHintType, BarcodeFormat[]>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          const controls = reader.scan(video, (result, _err, ctrls) => {
            if (stopped || !result) return;
            const text = result.getText().trim();
            if (text) {
              ctrls.stop();
              onCameraClosed();
              void onDecoded(text);
            }
          });
          stopZxing = () => controls.stop();
        } catch {
          if (!stopped) {
            onRuntimeError("バーコードの自動読み取りを開始できませんでした。");
            onCameraClosed();
          }
        }
      }
    })();

    return () => {
      stopped = true;
      stopZxing?.();
      stopZxing = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn, cameraSupported, onDecoded, onRuntimeError, onCameraClosed]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggleScan}
        className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors inline-flex items-center justify-center gap-2"
      >
        <span aria-hidden="true">{cameraOn ? "■" : "|||:"}</span>
        <span>{cameraOn ? "読み取りを停止" : "バーコード / QR を読み取り"}</span>
      </button>
      {cameraOn && (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="mx-auto w-full max-h-[min(42svh,15rem)] rounded-lg border border-gray-700 bg-black aspect-video object-cover sm:max-h-none"
        />
      )}
      {scanLoading && <p className="text-xs text-emerald-300">読み取り結果を検索中...</p>}
      {menuQrImportDone && (
        <p className="text-xs leading-relaxed text-emerald-300">{menuQrImportDone}</p>
      )}
      {cameraResult && (
        <p className="text-xs text-emerald-300">
          読み取り完了: {cameraResult.product_name}（{cameraResult.barcode}）
        </p>
      )}
      {scanError && <p className="text-xs text-amber-300">{scanError}</p>}
      {manualSharedProductPending && sharedBarcode && (
        <p className="text-xs text-emerald-300/90">
          共有に使うバーコード: <span className="font-mono">{sharedBarcode}</span>
        </p>
      )}
      {servingHint && <p className="text-xs text-amber-300">{servingHint}</p>}
      <p className="text-[11px] text-gray-500">
        市販品バーコードは Open Food Facts (ODbL) を参照します。Ketolog のメニュー共有 QR も読み取れます。
      </p>
      {onOpenStandardFoodSearch && (
        <button
          type="button"
          onClick={onOpenStandardFoodSearch}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
        >
          文科省成分表で検索
        </button>
      )}
    </div>
  );
}
