import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Detects new deploys by comparing the currently loaded JS bundle filename
 * with the one referenced by a freshly fetched index.html.
 *
 * No service worker required — works for "Add to Home Screen" installs.
 * When a new version is detected, shows a persistent toast with an
 * "Atualizar" button that reloads the page.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SCRIPT_SRC_RE = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/i;

function getCurrentBundleHref(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const main = scripts.find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
  if (!main) return null;
  try {
    return new URL(main.src, window.location.origin).pathname;
  } catch {
    return null;
  }
}

async function fetchLatestBundleHref(): Promise<string | null> {
  try {
    const res = await fetch(`/?v=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(SCRIPT_SRC_RE);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

let updatePromptShown = false;

function showUpdatePrompt() {
  if (updatePromptShown) return;
  updatePromptShown = true;

  toast('Nova versão disponível', {
    description: 'Atualize para receber as últimas melhorias.',
    duration: Infinity,
    action: {
      label: 'Atualizar',
      onClick: () => {
        const reload = () => window.location.reload();
        // Best-effort cache cleanup before reload (helps PWA installs)
        if (typeof caches !== 'undefined') {
          caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .finally(reload);
        } else {
          reload();
        }
      },
    },
  });
}

export function useVersionCheck() {
  const currentRef = useRef<string | null>(null);

  useEffect(() => {
    // In dev, vite serves /src/main.tsx directly — no /assets/index-*.js exists.
    // Skip silently to avoid noisy false positives.
    const current = getCurrentBundleHref();
    if (!current) return;
    currentRef.current = current;

    let cancelled = false;

    const check = async () => {
      if (cancelled || updatePromptShown) return;
      const latest = await fetchLatestBundleHref();
      if (cancelled || !latest) return;
      if (latest !== currentRef.current) {
        showUpdatePrompt();
      }
    };

    // Initial check after a short delay (don't block first paint)
    const initial = window.setTimeout(check, 15_000);
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    // Re-check whenever the app comes back to the foreground
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', check);
    };
  }, []);
}
