// Espelho de UX das regras da Edge Function `evolution-edit-message`.
// A função é a autoridade final; isto só decide se o botão aparece.

export const MESSAGE_EDIT_FLAG = 'evolution_message_edit_v1';
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface EditableMessageLike {
  direction?: string | null;
  sender_type?: string | null;
  sender_user_id?: string | null;
  content?: string | null;
  sent_at?: string | null;
  whatsapp_status?: string | null;
  whatsapp_message_sid?: string | null;
  media_urls?: string[] | null;
  media_type?: string | null;
  error_code?: string | null;
  is_internal_note?: boolean | null;
  template_id?: string | null;
  metadata?: Record<string, any> | null;
}

export function canEditMessage(m: EditableMessageLike, userId: string | null | undefined, flagOn: boolean, now = Date.now()): boolean {
  if (!flagOn || !userId) return false;
  if (m.direction !== 'outbound' || m.sender_type !== 'user' || m.sender_user_id !== userId) return false;
  if (m.is_internal_note || m.template_id || m.media_type || (m.media_urls && m.media_urls.length) || m.error_code) return false;
  if (!m.whatsapp_message_sid || m.whatsapp_status === 'failed' || m.whatsapp_status === 'sending') return false;
  // UX: só mensagens enviadas pela Evolution (metadata gravada pelo sender).
  if (!m.metadata?.evolution?.response?.key?.remoteJid) return false;
  if (!m.sent_at) return false;
  const age = now - new Date(m.sent_at).getTime();
  return age >= 0 && age <= EDIT_WINDOW_MS;
}

export function editErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'edit_window_expired': return 'O prazo de 15 minutos para editar terminou.';
    case 'not_author': return 'Só quem enviou a mensagem pode editá-la.';
    case 'content_unchanged': return 'O texto não mudou.';
    case 'concurrent_edit': return 'A mensagem mudou enquanto você editava. Recarregue e tente de novo.';
    case 'provider_rejected':
    case 'provider_unreachable': return 'O WhatsApp recusou a edição. A mensagem não foi alterada.';
    case 'feature_disabled': return 'Edição de mensagens não está habilitada.';
    case 'not_editable':
    case 'provider_not_supported':
    case 'remote_jid_invalid':
    case 'instance_mismatch': return 'Esta mensagem não pode ser editada.';
    default: return 'Não foi possível editar a mensagem.';
  }
}
