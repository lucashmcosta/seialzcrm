import React from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

const dsn =
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) ??
  "https://4c1f6fa2b1b8ecf9811ac1c34bc51833@o4510769203118080.ingest.us.sentry.io/4511604734164992";

// Injected by vite.config.ts via `define`. Falls back to a dev marker so
// events fired in `bun dev` are still tagged with something readable.
declare const __SENTRY_RELEASE__: string;
const release =
  typeof __SENTRY_RELEASE__ !== "undefined" ? __SENTRY_RELEASE__ : "seialz-crm@dev";

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release,

    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Tracing
    tracesSampleRate: 0.2,
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/.*\.lovable\.app/,
      /^https:\/\/seialz\.com/,
    ],

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
