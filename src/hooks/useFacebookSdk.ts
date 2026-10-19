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

export function useFacebookSdk() {
  const ensureSdk = useCallback((appId: string, version: string) => loadFacebookSdk(appId, version, getUiLocale()), []);

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
