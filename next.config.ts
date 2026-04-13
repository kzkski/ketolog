import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require("./package.json") as { version: string };

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    // Vercel はビルド時に VERCEL_GIT_COMMIT_SHA を渡す。ダッシュボードに
    // `$VERCEL_GIT_COMMIT_SHA` と文字入力しても展開されないため、ここで確実に埋める。
    ...(process.env.VERCEL_GIT_COMMIT_SHA && {
      NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA,
    }),
  },
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Keep build logs quiet outside CI.
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});
