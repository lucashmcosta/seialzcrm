import { loadFacebookSdk } from '@/lib/facebook-sdk';
import { getUiLocale } from '@/lib/ui-locale';
import { useCallback } from 'react';

// Carrega o Facebook JS SDK (pt_BR) sob demanda e faz FB.init uma única vez.
// appId/version vêm do backend (meta-connect-intent), sem VITE_ duplicado.
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export interface FbLoginResult {
  code?: string;
  status?: string;
  error?: string;
}

export interface FbLoginWatchdog {
  /**
   * Chamado se o callback do SDK chegar DEPOIS do watchdog já ter liberado a UI
   * (ex.: o usuário voltou à aba com o popup ainda aberto e concluiu depois).
   * Assim um `code` válido nunca é descartado.
   */
  onLateResult?: (result: FbLoginResult) => void;
  /** Tempo de tolerância, com a aba em foco e o popup fechado, antes de desistir. */
  graceMs?: number;
}

// O SDK nem sempre invoca o callback do FB.login quando o popup do Login for
// Business é fechado/finalizado (perda do vínculo opener↔popup). Sem isso a
// Promise nunca resolve e o botão fica em "Conectando…" para sempre.
function capturePopup(open: () => void): Window | null {
  let popup: Window | null = null;
  const original = window.open;
  window.open = function (...args: Parameters<typeof window.open>) {
    const w = original.apply(window, args);
    if (!popup) popup = w;
    return w;
  } as typeof window.open;
  try { open(); } finally { window.open = original; }
  return popup;
}

export function useFacebookSdk() {
  const ensureSdk = useCallback((appId: string, version: string) => loadFacebookSdk(appId, version, getUiLocale()), []);

  // Login for Business: usa config_id (não scope) e response_type=code.
  // `extras` é usado pelo WhatsApp Embedded Signup (v4: { setup: {} }).
  // `watchdog` (opt-in) resolve como `popup_closed` quando o popup some sem callback.
  const login = useCallback((configId: string, extras?: Record<string, unknown>, watchdog?: FbLoginWatchdog): Promise<FbLoginResult> => {
    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ error: 'sdk_not_ready' });
        return;
      }
      let settled = false;
      let timer: number | undefined;
      let closedSince: number | null = null;
      const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
      const settle = (result: FbLoginResult) => {
        if (settled) { if (result.code) watchdog?.onLateResult?.(result); return; }
        settled = true;
        stop();
        resolve(result);
      };
      const popup = capturePopup(() => window.FB.login(
        (response: any) => {
          const code = response?.authResponse?.code;
          if (code) settle({ code, status: response?.status });
          else settle({ status: response?.status, error: response?.status || 'cancelled' });
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          ...(extras ? { extras } : {}),
        },
      ));
      if (!watchdog) return;
      const graceMs = watchdog.graceMs ?? 3000;
      timer = window.setInterval(() => {
        // Popup fechado (ou referência perdida) E o usuário de volta nesta aba.
        let closed = true;
        try { closed = !popup || popup.closed; } catch { closed = true; }
        if (!closed || !document.hasFocus()) { closedSince = null; return; }
        closedSince ??= Date.now();
        if (Date.now() - closedSince >= graceMs) settle({ status: 'unknown', error: 'popup_closed' });
      }, 500);
    });
  }, []);

  return { ensureSdk, login };
}
