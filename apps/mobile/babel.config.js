/* eslint-disable @typescript-eslint/no-require-imports -- Babel は CommonJS 設定 */
// expo-router が apps/mobile 直下にしか無いと babel-preset-expo の hasModule("expo-router") が false になり、
// _ctx*.js の process.env.EXPO_ROUTER_APP_ROOT が置換されず Metro が失敗する。
const { expoRouterBabelPlugin } = require("babel-preset-expo/build/expo-router-plugin");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [expoRouterBabelPlugin, "react-native-reanimated/plugin"],
  };
};
