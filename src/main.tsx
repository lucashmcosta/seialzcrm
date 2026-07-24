import "./instrument";

import React from 'react';
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import App, { isStaleChunkError } from "./App.tsx";
import { PageLoader } from "./components/common/PageLoader";
import "./index.css";

function SentryFallback({ error }: { error: unknown }) {
  // Belt-and-suspenders: some lazy() imports don't go through retryImport
  // (e.g. Settings sub-pages). If we still land here because of a stale
  // chunk after deploy, show a spinner instead of a scary error message —
  // the app will typically already be reloading in the background.
  if (isStaleChunkError(error)) {
    return <PageLoader />;
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
