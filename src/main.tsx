import React from 'react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Defensive cleanup: unregister any legacy Service Worker and force a single hard refresh.
// Older app versions shipped vite-plugin-pwa and could keep serving stale JS chunks,
// making the UI run old code even after the source file changed.
if (typeof window !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const swResetKey = "__lovable_sw_reset_done";

  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return;

    await Promise.allSettled(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }

    if (window.sessionStorage.getItem(swResetKey) !== "1") {
      window.sessionStorage.setItem(swResetKey, "1");
      window.location.reload();
    }
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
