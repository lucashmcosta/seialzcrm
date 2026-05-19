import React from 'react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("CURRENT BUILD:", import.meta.env.MODE, "OutboundCall fix active");

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
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const isPreviewHost = window.location.hostname.includes('id-preview--') || window.location.hostname.includes('lovableproject.com');

  if (isInIframe || isPreviewHost) {
    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      if (registrations.length === 0) return;
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map((key) => caches.delete(key)));
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
