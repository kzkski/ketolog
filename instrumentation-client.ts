import * as Sentry from "@sentry/nextjs";

const environment =
  process.env.NEXT_PUBLIC_APP_ENV ??
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  process.env.NODE_ENV;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sampleRate: 1,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ignoreErrors: [
    /NetworkError/i,
    /Failed to fetch/i,
    /Load failed/i,
    /Non-Error promise rejection captured/i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
