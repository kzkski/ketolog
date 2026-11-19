import * as QuickActions from "expo-quick-actions";
import { useQuickActionCallback } from "expo-quick-actions/hooks";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuthSessionContext } from "./AuthSessionContext";

export const SCAN_BARCODE_ACTION_ID = "scan-barcode";
export const SCAN_BARCODE_HREF = "/(app)/today/scan-barcode";

function actionToPendingHref(action: QuickActions.Action): string | null {
  if (action.id === SCAN_BARCODE_ACTION_ID) {
    return SCAN_BARCODE_HREF;
  }
  const href = action.params?.href;
  if (typeof href === "string" && href === SCAN_BARCODE_HREF) {
    return SCAN_BARCODE_HREF;
  }
  return null;
}

function isOAuthLaunchUrl(url: string | null): boolean {
  return Boolean(url?.includes("auth/callback"));
}

type QuickActionIntentValue = {
  consumePendingNavigation: () => string | null;
  peekPendingNavigation: () => string | null;
};

const QuickActionIntentContext = createContext<QuickActionIntentValue | null>(null);

export function QuickActionIntentProvider({ children }: { children: ReactNode }) {
  const pendingHrefRef = useRef<string | null>(null);
  const consumedRef = useRef(false);

  const setPendingHref = useCallback((href: string) => {
    if (!consumedRef.current) {
      pendingHrefRef.current = href;
    }
  }, []);

  const applyAction = useCallback(
    (action: QuickActions.Action | undefined) => {
      if (!action) return;
      const href = actionToPendingHref(action);
      if (href) setPendingHref(href);
    },
    [setPendingHref]
  );

  useEffect(() => {
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (isOAuthLaunchUrl(initialUrl)) {
        return;
      }
      applyAction(QuickActions.initial);
      if (__DEV__ && QuickActions.initial) {
        // Phase 0: 実機で initial が取れるか確認するため
        console.info("[QuickAction] initial:", QuickActions.initial);
      }
    })();
  }, [applyAction]);

  const consumePendingNavigation = useCallback((): string | null => {
    if (consumedRef.current) {
      return null;
    }
    const href = pendingHrefRef.current;
    if (href) {
      consumedRef.current = true;
      pendingHrefRef.current = null;
      return href;
    }
    return null;
  }, []);

  const peekPendingNavigation = useCallback((): string | null => {
    return consumedRef.current ? null : pendingHrefRef.current;
  }, []);

  return (
    <QuickActionIntentContext.Provider value={{ consumePendingNavigation, peekPendingNavigation }}>
      <QuickActionWarmNavigation applyAction={applyAction} consumePendingNavigation={consumePendingNavigation} />
      {children}
    </QuickActionIntentContext.Provider>
  );
}

function QuickActionWarmNavigation({
  applyAction,
  consumePendingNavigation,
}: {
  applyAction: (action: QuickActions.Action) => void;
  consumePendingNavigation: () => string | null;
}) {
  const router = useRouter();
  const { session, loading } = useAuthSessionContext();

  useQuickActionCallback((action) => {
    applyAction(action);
    if (__DEV__) {
      console.info("[QuickAction] callback:", action);
    }
    if (!loading && session) {
      const href = actionToPendingHref(action);
      if (href) {
        consumePendingNavigation();
        router.replace(href);
      }
    }
  });

  return null;
}

export function useQuickActionIntent(): QuickActionIntentValue {
  const ctx = useContext(QuickActionIntentContext);
  if (!ctx) {
    throw new Error("useQuickActionIntent は QuickActionIntentProvider 配下でのみ使えます。");
  }
  return ctx;
}

/** ログイン済みの初回エントリ先（`shouldResolve` が true のときだけ consume） */
export function useAuthenticatedEntryHref(shouldResolve: boolean): string {
  const { consumePendingNavigation } = useQuickActionIntent();
  const hrefRef = useRef<string | null>(null);
  if (shouldResolve && hrefRef.current === null) {
    hrefRef.current = consumePendingNavigation() ?? "/(app)/today";
  }
  if (!shouldResolve) {
    return "/(app)/today";
  }
  return hrefRef.current ?? "/(app)/today";
}