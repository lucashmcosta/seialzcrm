import { useCallback } from 'react';

// Carrega o Facebook JS SDK (pt_BR) sob demanda e faz FB.init uma única vez.
// appId/version vêm do backend (meta-connect-intent), sem VITE_ duplicado.
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(appId: string, version: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    // #fb-root exigido pelo SDK.
    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div');
      root.id = 'fb-root';
      document.body.appendChild(root);
    }
    window.fbAsyncInit = () => {
      try {
        window.FB.init({ appId, cookie: true, xfbml: false, version });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const id = 'facebook-jssdk';
    if (document.getElementById(id)) return; // script já injetado
    const js = document.createElement('script');
    js.id = id;
    js.async = true;
    js.defer = true;
    js.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    js.onerror = () => reject(new Error('facebook_sdk_load_failed'));
    document.body.appendChild(js);
  });
  return sdkPromise;
}

export interface FbLoginResult {
  code?: string;
  status?: string;
  error?: string;
}

export function useFacebookSdk() {
  const ensureSdk = useCallback((appId: string, version: string) => loadSdk(appId, version), []);

  // Login for Business: usa config_id (não scope) e response_type=code.
  const login = useCallback((configId: string): Promise<FbLoginResult> => {
    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ error: 'sdk_not_ready' });
        return;
      }
      window.FB.login(
        (response: any) => {
          const code = response?.authResponse?.code;
          if (code) resolve({ code, status: response?.status });
          else resolve({ status: response?.status, error: response?.status || 'cancelled' });
        },
        { config_id: configId, response_type: 'code', override_default_response_type: true },
      );
    });
  }, []);

  return { ensureSdk, login };
}
