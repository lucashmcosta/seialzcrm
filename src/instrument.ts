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
  "'text/html' is not a valid javascript mime type",
  "is not a valid javascript mime type",
  "expected a javascript module script but the server responded",
  "expected a javascript-or-wasm module script",
  // Variants where the chunk resolved but the payload has no default export
  // (React.lazy internals). Kept in sync with isStaleChunkError in src/App.tsx.
  "cannot read properties of undefined (reading 'default')",
  "cannot read property 'default' of undefined",
  "undefined is not an object (evaluating 'default')",
  "_result.default",
  "evaluating '_result",
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

      // Drop errors whose stack points into Vite's dev dependency cache
      // (`/node_modules/.vite/deps/...`). That path only exists in the local
      // dev server / Lovable preview. When Vite re-optimizes dependencies
      // mid-session the tab ends up mixing chunks from two generations
      // (different `?v=` hashes), so a library can grab a second React copy
      // and blow up with "Cannot read properties of null (reading 'useRef')".
      // A reload fixes it and production is unaffected — pure dev noise.
      {
        const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
        const inViteDevDeps = frames.some((frame) => {
          const file = typeof frame?.filename === "string" ? frame.filename : "";
          return file.includes("/node_modules/.vite/deps/");
        });
        if (inViteDevDeps) return null;
      }


      // Drop stale/import errors originating inside the Twilio Voice SDK
      // bundle. The SDK dynamically imports workers and fetches CDN assets;
      // adblockers, CSPs and Safari ITP frequently block those and the SDK
      // rethrows as "Importing a module script failed". Call handlers are
      // wrapped in CallHandlersBoundary which silences them at the React
      // layer; this filter drops the same class of event when it arrives
      // as an unhandled rejection instead.
      {
        const firstEx = event.exception?.values?.[0];
        const frames = firstEx?.stacktrace?.frames ?? [];
        const inTwilio = frames.some((frame) => {
          const file = typeof frame?.filename === "string" ? frame.filename.toLowerCase() : "";
          return file.includes("twilio") || file.includes("voice-sdk");
        });
        if (inTwilio && isStaleChunkMessage(originalMessage)) return null;
      }

      // Drop uncaught errors originating inside the opus-media-recorder vendor
      // worker (encoderWorker.umd*.js — hashed at build time). These escape to
      // Sentry because they're thrown across the worker boundary; the app's
      // warmup path is best-effort and does not affect real recordings.
      // Predicate: ANY frame is inside encoderWorker.umd* AND the message
      // matches a known encoder-close race pattern — anything raised by our
      // own code stays visible.
      const firstException = event.exception?.values?.[0];
      const allFrames = firstException?.stacktrace?.frames ?? [];
      const mechanismType = firstException?.mechanism?.type;
      const inEncoderWorker = allFrames.some((frame) => {
        const file = typeof frame?.filename === "string" ? frame.filename : "";
        return file.includes("encoderWorker.umd");
      });
      const exceptionMessage =
        typeof firstException?.value === "string" ? firstException.value : "";
      const isEncoderCloseRace =
        /evaluating '[^']*\.close'/i.test(exceptionMessage) ||
        /reading '?close'?/i.test(exceptionMessage) ||
        /encoder\.close/i.test(exceptionMessage);
      if (inEncoderWorker && isEncoderCloseRace) {
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

      // Drop empty unhandled promise rejections (value: undefined) that are
      // correlated with Twilio Voice SDK reconnect activity. The SDK internally
      // rejects promises without a value during WSTransport reconnect/register
      // (WS close 1006 → ConnectionError 31005 / AccessTokenExpired 20104),
      // and the SDK reconnects on its own right after. Predicate is strict:
      // - unhandledrejection mechanism OR Sentry-normalized UnhandledRejection
      // - value is missing OR matches "Non-Error promise rejection ... undefined"
      // - a recent breadcrumb references TwilioVoice / twilio / voice-sdk
      const isEmptyRejection =
        exceptionValue === "" ||
        exceptionValue == null ||
        /non-error promise rejection captured with value:\s*undefined/i.test(
          exceptionValue,
        );
      const isUnhandledRejection =
        mechanismType === "onunhandledrejection" ||
        exceptionType === "UnhandledRejection";
      if (
        isUnhandledRejection &&
        isEmptyRejection
      ) {
        const breadcrumbs = event.breadcrumbs ?? [];
        const recent = breadcrumbs.slice(-30);
        const twilioRelated = recent.some((bc) => {
          const msg = typeof bc?.message === "string" ? bc.message : "";
          const cat = typeof bc?.category === "string" ? bc.category : "";
          const data = bc?.data as Record<string, unknown> | undefined;
          const args = Array.isArray(data?.arguments)
            ? (data!.arguments as unknown[]).map((a) =>
                typeof a === "string" ? a : "",
              ).join(" ")
            : "";
          const haystack = `${msg} ${cat} ${args}`.toLowerCase();
          return (
            haystack.includes("twiliovoice") ||
            haystack.includes("voice-sdk") ||
            haystack.includes("twilio device") ||
            haystack.includes("pstream") ||
            haystack.includes("wstransport")
          );
        });
        if (twilioRelated) return null;
      }

      // Drop React DOM reconciliation crashes caused by Google Translate (or
      // similar page translators) mutating text nodes out from under React.
      // Translate wraps text in <font> tags, so React's fiber references a
      // node that is no longer a child of its parent → NotFoundError from
      // insertBefore/removeChild. The app already recovers via the error
      // boundary; the crash is not actionable. Predicate is strict: must be
      // a NotFoundError mentioning insertBefore/removeChild AND the document
      // shows Translate is active (translated-ltr / translated-rtl class on
      // <html>, or injected <font> nodes).
      if (
        exceptionType === "NotFoundError" &&
        /(insertbefore|removechild)/i.test(exceptionValue)
      ) {
        try {
          const html = typeof document !== "undefined" ? document.documentElement : null;
          const isTranslated =
            !!html &&
            (html.classList.contains("translated-ltr") ||
              html.classList.contains("translated-rtl") ||
              document.querySelector("font > font") !== null);
          if (isTranslated) return null;
        } catch {
          // ignore — fall through to send
        }
      }

      return event;
    },
  });
}

