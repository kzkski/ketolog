"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChangelogRawUrlForClient,
  parseLatestDatedReleaseFromChangelog,
} from "@/lib/changelog-remote";
import { semverCompare } from "@/lib/semver-compare";

export type AppUpdateBannerState =
  | { kind: "idle" }
  | {
      kind: "update";
      latestVersion: string;
      /** ヘッダーに載せる短文 */
      line: string;
      /** ツールチップ用 */
      detail: string;
    };

async function applyServiceWorkerUpdateAndReload(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise<void>((resolve) => {
          const done = () => {
            navigator.serviceWorker.removeEventListener("controllerchange", done);
            resolve();
          };
          navigator.serviceWorker.addEventListener("controllerchange", done);
          window.setTimeout(done, 3000);
        });
      }
    }
  } catch {
    /* 続けてフルリロード */
  }
  window.location.reload();
}

/**
 * リモート CHANGELOG の最新版と `NEXT_PUBLIC_APP_VERSION` を比較し、古い場合は更新バナー用の文言を返す。
 * 本番かつ raw URL が解決できるときのみフェッチする。
 */
export function useAppUpdateBanner(): {
  banner: AppUpdateBannerState;
  applyUpdate: () => void;
} {
  const [banner, setBanner] = useState<AppUpdateBannerState>({ kind: "idle" });
  const fetchedRef = useRef(false);

  const check = useCallback(async () => {
    if (process.env.NODE_ENV !== "production") return;
    const rawUrl = getChangelogRawUrlForClient();
    const current = process.env.NEXT_PUBLIC_APP_VERSION;
    if (!rawUrl || !current) return;

    try {
      const res = await fetch(rawUrl, { cache: "no-store", credentials: "omit" });
      if (!res.ok) {
        setBanner({ kind: "idle" });
        return;
      }
      const md = await res.text();
      const latest = parseLatestDatedReleaseFromChangelog(md);
      if (!latest) {
        setBanner({ kind: "idle" });
        return;
      }
      if (semverCompare(latest.version, current) <= 0) {
        setBanner({ kind: "idle" });
        return;
      }
      const summaryPart = latest.summary ? ` ${latest.summary}` : "";
      setBanner({
        kind: "update",
        latestVersion: latest.version,
        line: `v${current} → v${latest.version} が利用可能です。タップで更新${summaryPart ? ` —${summaryPart}` : ""}`,
        detail: `現在 v${current}。リリース v${latest.version} が公開されています。${latest.summary ? `\n\n${latest.summary}` : ""}`,
      });
    } catch {
      setBanner({ kind: "idle" });
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const id = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(id);
  }, [check]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [check]);

  const applyUpdate = useCallback(() => {
    void applyServiceWorkerUpdateAndReload();
  }, []);

  return { banner, applyUpdate };
}
