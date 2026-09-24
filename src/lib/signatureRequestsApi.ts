import { supabase } from '@/integrations/supabase/client';

export class SignatureApiError extends Error {
  constructor(public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

// Todas as chamadas V2 passam pelo backend `signature-requests` (sem PII em URL).
export async function callSignatureRequests<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('signature-requests', { body: { action, ...payload } });
  if (error) {
    let body: any = null;
    try { body = await (error as any).context?.json?.(); } catch { /* sem corpo */ }
    throw new SignatureApiError(body?.error ?? 'request_failed', body?.message ?? 'Falha na comunicação com o servidor', body ?? {});
  }
  return data as T;
}

export const SIGNATURE_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviado', in_progress: 'Em assinatura', completing: 'Finalizando',
  completed: 'Concluído', cancelled: 'Cancelado',
};
export const PARTICIPANT_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando envio', invited: 'Convidado', opened: 'Abriu', viewed: 'Visualizou', signed: 'Assinou',
};
