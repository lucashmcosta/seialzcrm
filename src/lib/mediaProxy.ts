import { supabase } from '@/integrations/supabase/client';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PROXY_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/twilio-media-proxy`;

/**
 * If the URL points to api.twilio.com (which requires Basic Auth and would trigger
 * a browser login prompt), route it through our edge function proxy.
 * Otherwise return the URL untouched.
 */
export function getProxiedMediaUrl(url: string, organizationId: string | undefined, accessToken?: string): string {
  if (!url || !organizationId) return url;
  try {
    const u = new URL(url);
    if (u.hostname !== 'api.twilio.com') return url;
  } catch {
    return url;
  }
  const params = new URLSearchParams({ url, orgId: organizationId });
  if (accessToken) params.set('access_token', accessToken);
  return `${PROXY_URL}?${params.toString()}`;
}

/** Async variant that fetches the current session token. */
export async function getProxiedMediaUrlAsync(url: string, organizationId: string | undefined): Promise<string> {
  if (!url || !organizationId) return url;
  try {
    const u = new URL(url);
    if (u.hostname !== 'api.twilio.com') return url;
  } catch {
    return url;
  }
  const { data } = await supabase.auth.getSession();
  return getProxiedMediaUrl(url, organizationId, data.session?.access_token);
}
