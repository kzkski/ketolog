import type { ExpoConfig } from "expo/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootPackageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf8")
) as { version?: string };
const appVersion = rootPackageJson.version ?? "1.0.0";

/** iOS は Info.plist の NSCameraUsageDescription が無いとカメラ起動時に即クラッシュする（開発ビルドの取り込み漏れ対策で infoPlist にも明示） */
const cameraUsageDescription =
  "バーコードと共有メニューQRを読み取るためにカメラを使用します。";

/** `assets/icon.png` 外周の実測に合わせる（#0d2344 だとスプラッシュ全面との境がわずかに浮く） */
const brandBackgroundNavy = "#122a4b";

const config: ExpoConfig = {
  name: "Ketolog",
  slug: "mobile",
  version: appVersion,
  scheme: "ketolog",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  /** `splash-icon.png` は円＋白角のためスプラッシュに不向き。紺ベタの正方形 `icon.png` を使用 */
  splash: {
    image: "./assets/icon.png",
    resizeMode: "contain",
    backgroundColor: brandBackgroundNavy,
  },
  ios: {
    supportsTablet: true,
    /** `app.config.ts` では prebuild が自動追記できないため必須（未設定だと `expo run:ios` が無言で終了することがある） */
    bundleIdentifier: "com.ketolog.mobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: cameraUsageDescription,
    },
  },
  android: {
    package: "com.ketolog.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: brandBackgroundNavy,
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
      "expo-camera",
      {
        cameraPermission: cameraUsageDescription,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/icon.png",
        resizeMode: "contain",
        backgroundColor: brandBackgroundNavy,
      },
    ],
    ["./plugins/withIosCameraUsageDescription", { description: cameraUsageDescription }],
  ],
};

export default config;
