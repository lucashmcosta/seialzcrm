import "./instrument";

import React from 'react';
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import App, { isStaleChunkError, reloadForChunkRecovery } from "./App.tsx";
import { PageLoader } from "./components/common/PageLoader";
import { hardRefreshApp } from "./hooks/useVersionCheck";
import "./index.css";

function SentryFallback({ error }: { error: unknown }) {
  // Belt-and-suspenders: some lazy() imports may still surface here despite
  // retryImport. If we land here because of a stale chunk after deploy,
  // actively trigger the reload (throttled) and show a spinner instead of
  // the scary error UI. If the throttle blocked us, offer a manual button.
  if (isStaleChunkError(error)) {
    const reloadTriggered = reloadForChunkRecovery();
    if (reloadTriggered) {
      return <PageLoader />;
    }
    // Throttle blocked the immediate reload — force one shortly so the user
    // never gets stuck on the manual-refresh screen.
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        hardRefreshApp().catch(() => window.location.reload());
      }, 1500);
    }
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <p>Atualizando para a versão mais recente…</p>
        <button
          onClick={() => { hardRefreshApp().catch(() => window.location.reload()); }}
          style={{ marginTop: 12, padding: "8px 16px", cursor: "pointer" }}
        >
          Recarregar agora
        </button>
      </div>
    );
  }
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Algo deu errado</h1>
      <p>O erro foi reportado. Tente recarregar a página.</p>
    </div>
  );
}





function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function syncAppHeight() {
  const standalone = isStandaloneMode();
  const viewportHeight = window.visualViewport?.height ?? 0;
  const screenHeight = window.screen.height;
  const height = standalone
    ? viewportHeight > 0 && viewportHeight < screenHeight - 80
      ? viewportHeight
      : screenHeight
    : window.innerHeight;

  document.documentElement.dataset.standalone = standalone ? 'true' : 'false';
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

if (typeof window !== "undefined") {
  syncAppHeight();
  window.addEventListener('resize', syncAppHeight);
  window.addEventListener('orientationchange', syncAppHeight);
  window.visualViewport?.addEventListener('resize', syncAppHeight);
}

if (typeof window !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  // Service workers in this project are kill-switches (see public/sw.js).
  // On EVERY load — preview, iframe, and production — force the browser to
  // check for a SW update so returning clients pick up the new kill-switch
  // (which then unregisters itself and flushes caches). This evicts stale
  // bundles that caused the "Cannot access 'Lt' before initialization" TDZ
  // on previously deployed builds.
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return;
    await Promise.allSettled(registrations.map(async (registration) => {
      try {
        await registration.update();
      } catch {
        /* ignore */
      }
      try {
        await registration.unregister();
      } catch {
        /* ignore */
      }
    }));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  }).catch(() => {});
}

// Global stale-chunk guards — registered before React mounts so they cover:
//  * clients still running an older bundle that never wrapped a given lazy()
//    with retryImport (the rejection never hits our .catch),
//  * import() failures dispatched as `vite:preloadError` by the runtime,
//  * anything that escapes as an uncaught error / unhandled rejection.
if (typeof window !== "undefined") {
  const tryRecover = (err: unknown, event?: Event) => {
    if (!isStaleChunkError(err)) return;
    event?.preventDefault?.();
    reloadForChunkRecovery();
  };
  window.addEventListener("error", (event) => {
    tryRecover(event.error ?? event.message, event);
  });
  window.addEventListener("unhandledrejection", (event) => {
    tryRecover(event.reason, event);
  });
  // Vite dispatches this before the import() rejection surfaces to React.
  window.addEventListener("vite:preloadError", (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    tryRecover(payload ?? event, event);
  });
}

// DEV ONLY: Vite dependency re-optimization can leave the page with chunks from
// two different generations (symptom: "Cannot read properties of null (reading
// 'useRef')" / "Invalid hook call" coming from /node_modules/.vite/deps/).
// A single reload per session fixes it; production is untouched.
if (import.meta.env.DEV && typeof window !== "undefined") {
  const RELOAD_FLAG = "vite-deps-reloaded";
  const isViteDepsError = (err: unknown) => {
    const stack = err instanceof Error ? `${err.stack ?? ""} ${err.message}` : String(err ?? "");
    // React Fast Refresh can fail to reconcile the DOM after an HMR update
    // (symptom: NotFoundError on removeChild/insertBefore during
    // performReactRefresh, leaving a blank screen). A reload restores it.
    if (
      /performReactRefresh|scheduleRefresh|@react-refresh/.test(stack) &&
      /removeChild|insertBefore|NotFoundError/.test(stack)
    ) {
      return true;
    }
    if (!stack.includes("/node_modules/.vite/deps/")) return false;
    return /useRef|Invalid hook call|null \(reading|dispatcher/i.test(stack);
  };

  const recoverViteDeps = (err: unknown) => {
    if (!isViteDepsError(err)) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      return;
    }
    window.location.reload();
  };
  window.addEventListener("error", (event) => recoverViteDeps(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => recoverViteDeps(event.reason));
}

// TEMPORARY (audio progress audit): passive telemetry.
// Activation is resilient: ?audioProbe=1, #audioProbe, the parent document's
// query string (preview runs in an iframe), or a persisted localStorage flag.
if (typeof window !== "undefined") {
  const PROBE_KEY = "audioProbe";
  const hasInSearch = (search: string) => {
    try {
      return new URLSearchParams(search).has(PROBE_KEY);
    } catch {
      return false;
    }
  };
  const parentSearch = () => {
    try {
      if (window.parent && window.parent !== window) return window.parent.location.search;
    } catch {
      /* cross-origin parent — ignore */
    }
    return "";
  };
  const stored = () => {
    try {
      return window.localStorage.getItem(PROBE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const reasons: string[] = [];
  if (hasInSearch(window.location.search)) reasons.push("search");
  if (window.location.hash.includes(PROBE_KEY)) reasons.push("hash");
  if (hasInSearch(parentSearch())) reasons.push("parent-search");
  if (stored()) reasons.push("localStorage");

  if (reasons.length > 0) {
    if (reasons.some((r) => r !== "localStorage")) {
      try {
        window.localStorage.setItem(PROBE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line no-console
    console.log(`AUDIO_PROBE_ACTIVATION=${reasons.join("+")} URL=${window.location.href}`);
    // eslint-disable-next-line no-console
    console.log("AUDIO_PROBE_LOADED");
    import("./lib/dev/audioProbe")
      .then((m) => {
        // eslint-disable-next-line no-console
        console.log("AUDIO_PROBE_IMPORTED");
        m.installAudioProbe(reasons.join("+"));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("AUDIO_PROBE_LOAD_FAILED", err);
      });
  }
}




createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error }) => <SentryFallback error={error} />}
      showDialog={false}
    >
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
