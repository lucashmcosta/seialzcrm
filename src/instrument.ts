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

const STALE_CHUNK_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "loading chunk",
  "chunkloaderror",
  "module script",
];

function isStaleChunkMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const normalized = message.toLowerCase();
  return STALE_CHUNK_PATTERNS.some((entry) => normalized.includes(entry));
}

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
      /^https:\/\/.*\.vercel\.app/,
      /^https:\/\/seialz\.com/,
    ],

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Drop stale-chunk errors: these fire after a deploy when a user's tab
    // references an asset hash that no longer exists on the CDN. The app
    // handles them (silent reload via retryImport, spinner fallback in the
    // ErrorBoundary); they are not real bugs.
    beforeSend(event, hint) {
      const originalMessage =
        (hint?.originalException as { message?: unknown } | undefined)?.message ??
        event.exception?.values?.[0]?.value ??
        event.message;
      if (isStaleChunkMessage(originalMessage)) return null;

      // Drop uncaught errors originating inside the opus-media-recorder vendor
      // worker (encoderWorker.umd.js). These escape to window.onerror because
      // they're thrown across the worker boundary; the app's warmup path is
      // best-effort and does not affect real recordings. Predicate is strict:
      // top-frame filename must match AND mechanism must be the global onerror
      // handler — anything raised by our own code stays visible.
      const firstException = event.exception?.values?.[0];
      const topFrame = firstException?.stacktrace?.frames?.slice(-1)[0];
      const filename = typeof topFrame?.filename === "string" ? topFrame.filename : "";
      const mechanismType = firstException?.mechanism?.type;
      if (
        filename.includes("encoderWorker.umd.js") &&
        mechanismType === "onerror"
      ) {
        return null;
      }

      return event;
    },
  });
}

