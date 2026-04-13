import * as Sentry from "@sentry/nextjs";

const environment =
  process.env.SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_APP_ENV ??
  process.env.VERCEL_ENV ??
  process.env.NODE_ENV;

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
  sampleRate: 1,
  tracesSampleRate: 0.1,
  ignoreErrors: [/Non-Error promise rejection captured/i],
});
