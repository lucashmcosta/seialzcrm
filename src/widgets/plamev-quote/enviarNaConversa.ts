import { dispatchWhatsAppSend } from '@/lib/dispatchWhatsAppSend';
import type { WidgetContext } from '../types';

/** Conversa aberta onde o widget está (tela Comercial ou Inbox). null = widget fora de uma conversa. */
export interface Conversa { screen: 'commercial' | 'inbox'; threadId: string; contactId: string | null }

export function conversaDoContexto(context: WidgetContext): Conversa | null {
  if ((context.screen === 'commercial' || context.screen === 'inbox') && context.threadId) {
    return { screen: context.screen, threadId: context.threadId, contactId: context.contactId };
  }
  return null;
}

/** O WhatsApp aceita no máximo 4096 caracteres por mensagem (mesmo limite do dispatch-whatsapp-send). */
export const LIMITE_MENSAGEM = 4096;

/**
 * Manda texto na conversa aberta pelo mesmo caminho do composer (o servidor escolhe o número/provider da conversa).
 * Fora da janela de 24 h o WhatsApp exige template: aí o vendedor precisa mandar pela conversa.
 */
export async function enviarTextoNaConversa(input: {
  organizationId: string; userId: string | null; conversa: Conversa; texto: string;
}): Promise<void> {
  const { data, error } = await dispatchWhatsAppSend({
    organizationId: input.organizationId,
    threadId: input.conversa.threadId,
    contactId: input.conversa.contactId ?? undefined,
    message: input.texto,
    userId: input.userId ?? undefined,
    senderContext: input.conversa.screen === 'inbox' ? 'inbox' : 'messages',
  });
  if (error) {
    let motivo = error.message;
    try {
      const ctx = (error as { context?: { body?: unknown } }).context;
      const corpo = typeof ctx?.body === 'string' ? JSON.parse(ctx.body) : ctx?.body;
      motivo = (corpo as { error?: string } | undefined)?.error || motivo;
    } catch { /* sem corpo */ }
    throw new Error(motivo || 'Não foi possível enviar.');
  }
  if (data?.requiresTemplate) {
    throw new Error('Fora da janela de 24 h do WhatsApp. Mande um template pela conversa e tente de novo depois que o cliente responder.');
  }
  if (data?.error) throw new Error(data.message || data.error);
}
