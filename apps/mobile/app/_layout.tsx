import "react-native-url-polyfill/auto";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthSessionProvider, useAuthSessionContext } from "../contexts/AuthSessionContext";
import { MissingSupabaseConfigScreen } from "../components/MissingSupabaseConfigScreen";
import { isSupabaseConfigured } from "../lib/supabase";

WebBrowser.maybeCompleteAuthSession();
SplashScreen.setOptions({ fade: true, duration: 280 });
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  if (!isSupabaseConfigured()) {
    return <MissingSupabaseRoot />;
  }
  return (
    <AuthSessionProvider>
      <ConfiguredRootLayout />
    </AuthSessionProvider>
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
