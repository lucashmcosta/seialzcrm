import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const INITIAL_DELAY_MS = 12_000;
const SCRIPT_SRC_RE = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/i;
const UPDATE_TOAST_ID = 'app-update-available';

let updatePromptShown = false;

function getCurrentBundleHref(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const mainScript = scripts.find((script) => /\/assets\/index-[^/]+\.js($|\?)/.test(script.src));

  if (!mainScript) return null;

  try {
    return new URL(mainScript.src, window.location.origin).pathname;
  } catch {
    return null;
  }
}

async function fetchVersionFingerprint(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return typeof data === 'string' ? data : JSON.stringify(data);
    }

    const text = await response.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function fetchLatestBundleHref(): Promise<string | null> {
  try {
    const response = await fetch(`/index.html?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
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
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
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
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
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
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
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

function showUpdatePrompt() {
  if (updatePromptShown) return;
  updatePromptShown = true;

  toast('Nova versão disponível', {
    id: UPDATE_TOAST_ID,
    description: 'Toque em atualizar para recarregar o app com a versão mais recente.',
    duration: Infinity,
    action: {
      label: 'Atualizar',
      onClick: () => {
        void hardRefreshApp();
      },
    },
  });
}

export function useVersionCheck() {
  const currentBundleRef = useRef<string | null>(null);
  const versionFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    currentBundleRef.current = getCurrentBundleHref();

    let cancelled = false;

    const captureInitialFingerprint = async () => {
      const fingerprint = await fetchVersionFingerprint();
      if (!cancelled && fingerprint) {
        versionFingerprintRef.current = fingerprint;
      }
    };

    const checkForUpdate = async () => {
      if (cancelled || updatePromptShown) return;

      const latestFingerprint = await fetchVersionFingerprint();
      if (cancelled || updatePromptShown) return;

      if (latestFingerprint && versionFingerprintRef.current && latestFingerprint !== versionFingerprintRef.current) {
        showUpdatePrompt();
        return;
      }

      if (latestFingerprint && !versionFingerprintRef.current) {
        versionFingerprintRef.current = latestFingerprint;
      }

      const currentBundle = currentBundleRef.current;
      if (!currentBundle) return;

      const latestBundle = await fetchLatestBundleHref();
      if (cancelled || updatePromptShown) return;

      if (latestBundle && latestBundle !== currentBundle) {
        showUpdatePrompt();
        return;
      }

      const bundleStillExists = await currentBundleStillExists(currentBundle);
      if (!cancelled && bundleStillExists === false) {
        showUpdatePrompt();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      const message = getErrorMessage(event.error ?? event.message);
      if (isStaleChunkError(message)) {
        showUpdatePrompt();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      if (isStaleChunkError(message)) {
        showUpdatePrompt();
      }
    };

    void captureInitialFingerprint();

    const initialTimer = window.setTimeout(() => {
      void checkForUpdate();
    }, INITIAL_DELAY_MS);

    const interval = window.setInterval(() => {
      void checkForUpdate();
    }, POLL_INTERVAL_MS);

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