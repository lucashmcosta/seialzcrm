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
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
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

      // Drop Twilio Voice SDK setSinkId rejections. When a call connects the
      // SDK tries to route the ringback/incoming audio to a specific output
      // device via HTMLMediaElement.setSinkId, which browsers gate behind a
      // user gesture. The call itself still works (audio falls back to the
      // default device); the rejection is cosmetic and comes through as an
      // unhandledrejection from Twilio's own bundle. Predicate is strict:
      // message must mention the gesture requirement AND the frame must be
      // inside a Twilio SDK file (setSinkId/insetSinkId/twilio/voice-sdk) or
      // the mechanism must be the global unhandledrejection handler.
      const exceptionType = firstException?.type;
      const exceptionValue =
        typeof firstException?.value === "string" ? firstException.value : "";
      const frames = firstException?.stacktrace?.frames ?? [];
      const isSetSinkIdFrame = frames.some((frame) => {
        const fn = typeof frame?.function === "string" ? frame.function.toLowerCase() : "";
        const file = typeof frame?.filename === "string" ? frame.filename.toLowerCase() : "";
        return (
          fn.includes("setsinkid") ||
          file.includes("twilio") ||
          file.includes("voice-sdk")
        );
      });
      if (
        exceptionType === "NotAllowedError" &&
        /user gesture is required/i.test(exceptionValue) &&
        (isSetSinkIdFrame || mechanismType === "onunhandledrejection")
      ) {
        return null;
      }

      // Drop Twilio Voice SDK "Device not found: default" rejections. After a
      // call disconnects, the SDK's AudioHelper re-enumerates media devices;
      // if the OS-labelled "default" input momentarily disappears (headset
      // unplug, driver blip, permission re-check) the SDK rejects with
      // InvalidArgumentError. Calls are unaffected — the next call recreates
      // the Device cleanly. Predicate is strict: must be InvalidArgumentError
      // whose message matches "Device not found: default" AND originate from
      // a Twilio SDK frame or the global unhandledrejection handler.
      const isTwilioFrame = frames.some((frame) => {
        const file = typeof frame?.filename === "string" ? frame.filename.toLowerCase() : "";
        return file.includes("twilio") || file.includes("voice-sdk");
      });
      if (
        exceptionType === "InvalidArgumentError" &&
        /device not found:\s*default/i.test(exceptionValue) &&
        (isTwilioFrame || mechanismType === "onunhandledrejection")
      ) {
        return null;
      }

      return event;
    },
  });
}

