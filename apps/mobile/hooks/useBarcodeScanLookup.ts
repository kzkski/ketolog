import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  lookupSharedProductByBarcodeMobile,
  type BarcodeLookupResult,
} from "../lib/shared-product-lookup";

const LOOKUP_DEBOUNCE_MS = 3000;

export type BarcodeScanLookupState = {
  barcode: string;
  lookup: BarcodeLookupResult;
} | null;

export function useBarcodeScanLookup(supabase: SupabaseClient, userId: string) {
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastLookup, setLastLookup] = useState<{ barcode: string; at: number } | null>(null);
  const [result, setResult] = useState<BarcodeScanLookupState>(null);

  const resetForRescan = useCallback(() => {
    setResult(null);
    setScanError(null);
    setScanLoading(false);
  }, []);

  const lookupBarcode = useCallback(
    async (rawBarcode: string) => {
      const normalized = rawBarcode.replace(/[^\d]/g, "");
      if (!normalized) {
        setScanError("バーコードを読み取れませんでした。もう一度お試しください。");
        setResult(null);
        return;
      }
      if (lastLookup?.barcode === normalized && Date.now() - lastLookup.at < LOOKUP_DEBOUNCE_MS) {
        return;
      }

      setScanLoading(true);
      setScanError(null);
      setLastLookup({ barcode: normalized, at: Date.now() });

      const res = await lookupSharedProductByBarcodeMobile(supabase, userId, normalized);
      setScanLoading(false);

      if (res.status === "error") {
        setScanError(res.error ?? "バーコードの照会に失敗しました");
        setResult(null);
        return;
      }

      setResult({ barcode: normalized, lookup: res });
    },
    [lastLookup, supabase, userId]
  );

  return {
    scanLoading,
    scanError,
    setScanError,
    result,
    lookupBarcode,
    resetForRescan,
  };
}