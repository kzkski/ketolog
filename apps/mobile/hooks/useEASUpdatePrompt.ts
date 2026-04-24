import { useCallback, useEffect, useRef } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

const COOLDOWN_MS = 60_000;
const START_DELAY_MS = 2_000;

/**
 * EAS Update: 起動遅延後とフォアグラウンド復帰時に `check` → `fetch` し、必要なら再読み込みを案内する。
 * `__DEV__` または `Updates.isEnabled === false` では no-op（例外は握る）。
 */
export function useEASUpdatePrompt(): void {
  const inFlight = useRef(false);
  const lastRunEndAt = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const run = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    if (inFlight.current) return;
    const now = Date.now();
    if (now - lastRunEndAt.current < COOLDOWN_MS && lastRunEndAt.current > 0) return;

    inFlight.current = true;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) {
          Alert.alert(
            "アップデート",
            "新しい内容が配信されています。再読み込みで反映できます。",
            [
              { text: "あとで", style: "cancel" },
              { text: "再読み込み", onPress: () => void Updates.reloadAsync() },
            ],
            { cancelable: true }
          );
        }
        return;
      }
      if (check.isRollBackToEmbedded) {
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isRollBackToEmbedded) {
          Alert.alert(
            "更新",
            "内蔵バージョンに戻す更新です。再読み込みで反映できます。",
            [
              { text: "あとで", style: "cancel" },
              { text: "再読み込み", onPress: () => void Updates.reloadAsync() },
            ],
            { cancelable: true }
          );
        }
      }
    } catch (e) {
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console -- 開発時のみ
        console.warn("[expo-updates]", msg);
      }
    } finally {
      inFlight.current = false;
      lastRunEndAt.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        void run();
      }
      appStateRef.current = next;
    });

    const startTimer = setTimeout(() => {
      void run();
    }, START_DELAY_MS);

    return () => {
      sub.remove();
      clearTimeout(startTimer);
    };
  }, [run]);
}
