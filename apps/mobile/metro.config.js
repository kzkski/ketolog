/* eslint-disable @typescript-eslint/no-require-imports -- Metro は CommonJS 設定 */
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.resolve(projectRoot, "node_modules");
const rootNodeModules = path.resolve(monorepoRoot, "node_modules");
const resolvePath = (module) =>
  path.dirname(
    require.resolve(`${module}/package.json`, { paths: [projectRoot, monorepoRoot] }),
  );

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  rootNodeModules,
];

// モノレプロで二重の react があると useState が null になる。1 本の realpath に揃える。
// overrides 後は react がルートに hoisted されることもあるので、存在パスを require.resolve する。
config.resolver.extraNodeModules = {
  react: resolvePath("react"),
  "react-native": resolvePath("react-native"),
  "react/jsx-runtime": require.resolve("react/jsx-runtime", { paths: [projectRoot, monorepoRoot] }),
  "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime", { paths: [projectRoot, monorepoRoot] }),
};

module.exports = config;
