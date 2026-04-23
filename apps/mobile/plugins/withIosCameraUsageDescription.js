/**
 * iOS の Info.plist に NSCameraUsageDescription を必ず入れる。
 * expo-camera の Permissions プラグインや app.json の infoPlist だけでは
 * 環境によって欠落し、カメラ起動時に TCC で即クラッシュすることがある。
 */
const { withInfoPlist } = require("expo/config-plugins");

/**
 * @param {import("@expo/config-types").ExpoConfig} config
 * @param {{ description?: string }} [props]
 */
module.exports = function withIosCameraUsageDescription(config, props = {}) {
  const description =
    props.description ??
    "バーコードと共有メニューQRを読み取るためにカメラを使用します。";

  return withInfoPlist(config, (mod) => {
    mod.modResults.NSCameraUsageDescription = String(description);
    return mod;
  });
};
