import { supabase } from '@/integrations/supabase/client';

export type PortalConversation = {
  conversationId: string;
  seialzContactId: string;
  status: 'open' | 'resolved';
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  lastFrom: 'client' | 'staff';
  unreadForStaff: number;
  assignedTo?: { userId: string; name: string } | null;
};

export type PortalAttachment = { id: string; name: string; mimeType: string; size: number; url: string };
export type PortalMessage = {
  id: string;
  from: 'client' | 'staff';
  body?: string | null;
  staffName?: string | null;
  createdAt: string;
  readByClientAt?: string | null;
  attachments: PortalAttachment[];
};

export const PORTAL_ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
export const PORTAL_MAX_SIZE = 10 * 1024 * 1024;

const ERRORS: Record<string, string> = {
  forbidden: 'Você não tem permissão para esta ação no Atendimento.',
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  portal_unreachable: 'O App do cliente não respondeu. Tente de novo em instantes.',
  invalid_params: 'Dados inválidos.',
};

export class PortalError extends Error {
  constructor(public code: string) { super(ERRORS[code] ?? `Não foi possível concluir (${code}).`); }
}

/** Chamada única ao proxy; organização e identidade vêm da sessão no servidor. */
export async function portalCall<T>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('client-portal-staff-proxy', { body: { op, params } });
  if (error) {
    let code = 'unknown';
    try { code = (await (error as any).context?.json())?.code ?? code; } catch { /* ignore */ }
    throw new PortalError(code);
  }
  return data as T;
}
