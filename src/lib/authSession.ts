import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const INVALID_SESSION_MESSAGES = [
  'session not found',
  'invalid token',
  'invalid jwt',
  'jwt expired',
  'refresh token not found',
  'user from sub claim in jwt does not exist',
];

function isInvalidSessionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return INVALID_SESSION_MESSAGES.some((item) => message.includes(item));
}

export async function getVerifiedSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const session = data.session;
  if (!session?.access_token) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);

  if (userError || !userData.user) {
    if (isInvalidSessionError(userError)) {
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }

    throw userError ?? new Error('Não foi possível validar a sessão atual.');
  }

  return session;
}

export async function getTwilioAccessToken(body?: Record<string, unknown>): Promise<string | null> {
  const session = await getVerifiedSession();

  if (!session) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke('twilio-token', body ? { body } : undefined);

  if (error || !data?.token) {
    const message = error instanceof Error ? error.message : '';

    if (isInvalidSessionError(error) || message.includes('Edge Function returned 401')) {
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }

    throw new Error('Erro ao obter token de acesso');
  }

  return data.token as string;
}