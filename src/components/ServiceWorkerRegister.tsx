"use client";

import { useEffect } from "react";

/**
 * Registers the app shell service worker in production only.
 * Failures are ignored so the site keeps working without SW.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
