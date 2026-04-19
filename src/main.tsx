import React from 'react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Defensive cleanup: unregister ANY previously installed Service Worker on every load.
// Earlier versions of this app shipped vite-plugin-pwa, whose SW intercepts navigation
// inside the Lovable preview iframe and serves stale chunks → white screen.
// Running this synchronously, before mounting React, guarantees the next reload is clean.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  }).catch(() => {});

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    }).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
