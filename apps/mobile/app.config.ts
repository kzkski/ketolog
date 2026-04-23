import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Ketolog",
  slug: "mobile",
  version: "1.0.0",
  scheme: "ketolog",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  /** ロゴ外周の紺（`public/icons/icon-512.png` と揃える） */
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0d2344",
  },
  ios: {
    supportsTablet: true,
    /** `app.config.ts` では prebuild が自動追記できないため必須（未設定だと `expo run:ios` が無言で終了することがある） */
    bundleIdentifier: "com.ketolog.mobile",
  },
  android: {
    package: "com.ketolog.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0d2344",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#0d2344",
      },
    ],
  ],
};

export default config;
