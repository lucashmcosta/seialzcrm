// Janelas WhatsApp — modelagem correta.
//
// Duas janelas independentes:
//
//  1. conversationWindow (24h)
//     Base: last_inbound_at + 24h.
//     Controla SOMENTE freeform (texto livre). Fora dela, apenas templates.
//
//  2. billingWindow (72h CTWA)
//     Base: first_ctwa_message_at + 72h (âncora: ad_referral_captured_at
//     || contact.created_at, quando o contato tem sinais reais de CTWA).
//     Controla SOMENTE gratuidade de templates. Não libera freeform.
//
// A antiga `serviceWindow = max(24h, 72h)` foi removida. `getServiceWindow`
// segue exportada por compatibilidade, mas seu `isOpen` agora corresponde
// exclusivamente à `conversationWindow` (freeform).

export type ConversationWindowStatus = 'open' | 'closed' | 'never';
export type BillingWindowType = 'ctwa' | 'normal';

export interface ContactCtwaInputs {
  source?: string | null;
  utm_medium?: string | null;
  ad_referral_ctwa_clid?: string | null;
  ad_referral_captured_at?: string | null;
  created_at?: string | null;
}

export interface WindowInput {
  lastInboundAt?: string | null;
  contact?: ContactCtwaInputs | null;
  /** Timestamp de referência (default: Date.now()). Útil para testes. */
  now?: number;
}

export interface ConversationWindow {
  status: ConversationWindowStatus;
  expiresAt: number | null;
  isOpen: boolean;
  remainingMs: number;
}

export interface BillingWindow {
  /** `ctwa` quando o contato tem sinais CTWA; `normal` caso contrário. */
  type: BillingWindowType;
  /** Só populado quando `type === 'ctwa'`. */
  expiresAt: number | null;
  /** True apenas quando `type === 'ctwa'` e ainda dentro dos 72h. */
  isOpen: boolean;
  remainingMs: number;
  isCtwaContact: boolean;
}

// Retorno consolidado (compat com callers antigos).
export interface ServiceWindow {
  conversation: ConversationWindow;
  billing: BillingWindow;
  // ---- compat legado ----
  /** Alias de `conversation.isOpen` — gate de freeform. */
  isOpen: boolean;
  /** Alias de `conversation.expiresAt`. */
  expiresAt: number | null;
  /** Alias de `conversation.remainingMs`. */
  remainingMs: number;
  /** `ctwa` se a billingWindow CTWA estiver ativa, senão `session`/`none`. */
  originType: 'ctwa' | 'session' | 'none';
  isCtwaContact: boolean;
  /** Texto curto para tooltip/log. */
  reason: string;
}

const HOUR_MS = 60 * 60 * 1000;

export function isCtwaContact(contact: ContactCtwaInputs | null | undefined): boolean {
  if (!contact) return false;
  if (contact.source && String(contact.source).toLowerCase() === 'ctwa') return true;
  if (contact.ad_referral_ctwa_clid) return true;
  if (contact.utm_medium && String(contact.utm_medium).toLowerCase() === 'ctwa') return true;
  return false;
}

export function getFirstCtwaAt(contact: ContactCtwaInputs | null | undefined): string | null {
  if (!contact) return null;
  if (!isCtwaContact(contact)) return null;
  return contact.ad_referral_captured_at || contact.created_at || null;
}

export function getConversationWindow(input: WindowInput): ConversationWindow {
  const now = input.now ?? Date.now();
  if (!input.lastInboundAt) {
    return { status: 'never', expiresAt: null, isOpen: false, remainingMs: 0 };
  }
  const expiresAt = new Date(input.lastInboundAt).getTime() + 24 * HOUR_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  const isOpen = remainingMs > 0;
  return { status: isOpen ? 'open' : 'closed', expiresAt, isOpen, remainingMs };
}

export function getBillingWindow(input: WindowInput): BillingWindow {
  const now = input.now ?? Date.now();
  const contact = input.contact ?? null;
  const isCtwa = isCtwaContact(contact);
  const anchor = getFirstCtwaAt(contact);
  if (!isCtwa || !anchor) {
    return {
      type: 'normal',
      expiresAt: null,
      isOpen: false,
      remainingMs: 0,
      isCtwaContact: isCtwa,
    };
  }
  const expiresAt = new Date(anchor).getTime() + 72 * HOUR_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  return {
    type: 'ctwa',
    expiresAt,
    isOpen: remainingMs > 0,
    remainingMs,
    isCtwaContact: true,
  };
}

/**
 * Retorno consolidado. `isOpen` mapeia SOMENTE para a conversationWindow
 * (freeform). A billingWindow é informativa para UI de templates.
 */
export function getServiceWindow(input: WindowInput): ServiceWindow {
  const conversation = getConversationWindow(input);
  const billing = getBillingWindow(input);

  const originType: ServiceWindow['originType'] =
    billing.isOpen ? 'ctwa'
    : conversation.isOpen ? 'session'
    : 'none';

  let reason: string;
  if (conversation.isOpen) {
    reason = `Sessão 24h — expira em ${formatRemaining(conversation.remainingMs)}`;
  } else if (billing.isOpen) {
    reason = `Templates gratuitos por mais ${formatRemaining(billing.remainingMs)}`;
  } else if (conversation.status === 'never') {
    reason = 'Sem inbound — só template';
  } else {
    reason = 'Fora da janela 24h';
  }

  return {
    conversation,
    billing,
    isOpen: conversation.isOpen,
    expiresAt: conversation.expiresAt,
    remainingMs: conversation.remainingMs,
    originType,
    isCtwaContact: billing.isCtwaContact,
    reason,
  };
}

export function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
