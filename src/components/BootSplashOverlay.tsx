"use client";

import type { CSSProperties } from "react";
import { useLayoutEffect, useState } from "react";

const BOOT_BG = "#030712";

/**
 * PNG とは別物の簡易ブランドマーク。HTML に直書きしネットワークゼロで描画する。
 * （濃紺円・オレンジのライン・水色/白の K）
 */
function KetologBootMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="48" fill="#0f1e3d" />
      <path
        d="M 14 62 C 32 42 48 40 62 52 S 82 48 86 44"
        fill="none"
        stroke="#f97316"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 28 22 v 56"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M 28 48 L 52 24"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 28 48 L 54 76"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: BOOT_BG,
};

/**
 * 外部 CSS 適用前でも見えるよう、スタイルはすべてインライン。
 * 2 フレーム後に外し、その下の本文がペイントされるのを待つ。
 */
export function BootSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useLayoutEffect(() => {
    let cancelled = false;
    const id1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setVisible(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={overlayStyle} aria-hidden>
      <KetologBootMark size={88} />
    </div>
  );
}
