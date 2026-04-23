import type { ExpoConfig } from "expo/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootPackageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf8")
) as { version?: string };
const appVersion = rootPackageJson.version ?? "1.0.0";

const config: ExpoConfig = {
  name: "Ketolog",
  slug: "mobile",
  version: appVersion,
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
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
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
  extra: {
    eas: {
      projectId: "153113f9-7a7c-4c8f-a4df-deb628ade3d5",
    },
  },
  updates: {
    url: "https://u.expo.dev/153113f9-7a7c-4c8f-a4df-deb628ade3d5",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  plugins: [
    "expo-router",
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
