import type { AppLocale } from './locale';
let pending: Promise<void> | null = null;
let loadedLocale: AppLocale | null = null;
export const facebookLocale = (locale: AppLocale) => locale === 'en-US' ? 'en_US' : 'pt_BR';
export function reloadForFacebookLocale(locale: AppLocale) {
  if (loadedLocale && loadedLocale !== locale) window.location.reload();
}
export function loadFacebookSdk(appId: string, version: string, locale: AppLocale): Promise<void> {
  if (loadedLocale && loadedLocale !== locale) {
    window.location.reload();
    return Promise.reject(new Error('facebook_sdk_locale_changed'));
  }
  if (pending) return pending;
  loadedLocale = locale;
  pending = new Promise<void>((resolve, reject) => {
    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div'); root.id = 'fb-root'; document.body.appendChild(root);
    }
    const timeout = window.setTimeout(() => reject(new Error('facebook_sdk_timeout')), 20_000);
    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);
      try { window.FB.init({ appId, cookie: true, xfbml: false, version }); resolve(); }
      catch (e) { reject(e); }
    };
    document.getElementById('facebook-jssdk')?.remove();
    const script = document.createElement('script');
    script.id = 'facebook-jssdk'; script.async = true; script.defer = true;
    script.src = `https://connect.facebook.net/${facebookLocale(locale)}/sdk.js`;
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('facebook_sdk_load_failed')); };
    document.body.appendChild(script);
  }).catch(error => {
    pending = null; loadedLocale = null;
    document.getElementById('facebook-jssdk')?.remove();
    window.fbAsyncInit = undefined;
    throw error;
  });
  return pending;
}
