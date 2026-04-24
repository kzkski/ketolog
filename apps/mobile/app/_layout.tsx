import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthSessionProvider, useAuthSessionContext } from "../contexts/AuthSessionContext";
import { MissingSupabaseConfigScreen } from "../components/MissingSupabaseConfigScreen";
import { useEASUpdatePrompt } from "../hooks/useEASUpdatePrompt";
import { isSupabaseConfigured } from "../lib/supabase";

WebBrowser.maybeCompleteAuthSession();
SplashScreen.setOptions({ fade: true, duration: 280 });
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  if (!isSupabaseConfigured()) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MissingSupabaseRoot />
      </GestureHandlerRootView>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthSessionProvider>
        <ConfiguredRootLayout />
      </AuthSessionProvider>
    </GestureHandlerRootView>
  );
}

function MissingSupabaseRoot() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return <MissingSupabaseConfigScreen />;
}

function ConfiguredRootLayout() {
  const { loading, initError } = useAuthSessionContext();
  useEASUpdatePrompt();

  /** `getSession` が返らない環境でもネイティブスプラッシュで止まらないようにする */
  useEffect(() => {
    const failSafe = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 4000);
    return () => clearTimeout(failSafe);
  }, []);

  useEffect(() => {
    if (!loading || initError) {
      void SplashScreen.hideAsync();
    }
  }, [loading, initError]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
