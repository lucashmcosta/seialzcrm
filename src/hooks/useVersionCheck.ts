import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const POLL_INTERVAL_MS = 60 * 1000;
const INITIAL_DELAY_MS = 3_000;
const SCRIPT_SRC_RE = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/i;

// --- Global update store (so any component can subscribe) ---
let updateAvailable = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setUpdateAvailable(value: boolean) {
  if (updateAvailable === value) return;
  updateAvailable = value;
  emit();
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => updateAvailable,
    () => false,
  );
}

// --- Helpers ---
function getCurrentBundleHref(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const mainScript = scripts.find((s) => /\/assets\/index-[^/]+\.js($|\?)/.test(s.src));
  if (!mainScript) return null;
  try {
    return new URL(mainScript.src, window.location.origin).pathname;
  } catch {
    return null;
  }
}

async function fetchLatestBundleHref(): Promise<string | null> {
  try {
    const response = await fetch(`/index.html?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(SCRIPT_SRC_RE);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function currentBundleStillExists(bundleHref: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${bundleHref}?ts=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' },
    });
    if (response.status === 404 || response.status === 410) return false;
    if (response.ok) return true;
    return null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return '';
}

function isStaleChunkError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'loading chunk',
    'chunkloaderror',
    'module script',
  ].some((entry) => normalized.includes(entry));
}

async function clearAppCaches() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.allSettled(registrations.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.allSettled(keys.map((key) => caches.delete(key)));
  }
}

export async function hardRefreshApp() {
  try {
    await clearAppCaches();
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('app-refresh', Date.now().toString());
    window.location.replace(url.toString());
  }
}

export function useVersionCheck() {
  const currentBundleRef = useRef<string | null>(null);

  useEffect(() => {
    currentBundleRef.current = getCurrentBundleHref();
    let cancelled = false;

    const checkForUpdate = async () => {
      if (cancelled || updateAvailable) return;
      const currentBundle = currentBundleRef.current;
      if (!currentBundle) return;

      const latestBundle = await fetchLatestBundleHref();
      if (cancelled || updateAvailable) return;
      if (latestBundle && latestBundle !== currentBundle) {
        setUpdateAvailable(true);
        return;
      }

      const stillExists = await currentBundleStillExists(currentBundle);
      if (!cancelled && stillExists === false) setUpdateAvailable(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    const handleWindowError = (e: ErrorEvent) => {
      if (isStaleChunkError(getErrorMessage(e.error ?? e.message))) setUpdateAvailable(true);
    };
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (isStaleChunkError(getErrorMessage(e.reason))) setUpdateAvailable(true);
    };

    const initialTimer = window.setTimeout(() => void checkForUpdate(), INITIAL_DELAY_MS);
    const interval = window.setInterval(() => void checkForUpdate(), POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkForUpdate);
      window.removeEventListener('pageshow', checkForUpdate);
      window.removeEventListener('online', checkForUpdate);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}

export function triggerManualUpdateCheck() {
  void (async () => {
    const current = getCurrentBundleHref();
    if (!current) {
      await hardRefreshApp();
      return;
    }
    const latest = await fetchLatestBundleHref();
    if (latest && latest !== current) {
      setUpdateAvailable(true);
      return;
    }
    const exists = await currentBundleStillExists(current);
    if (exists === false) {
      setUpdateAvailable(true);
      return;
    }
    // No update detected — force a clean reload anyway since the user explicitly asked.
    await hardRefreshApp();
  })();
}
