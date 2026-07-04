// Hotfix compliance WhatsApp — janela de atendimento unificada.
//
// Regra:
//   expiresAt = max(last_inbound_at + 24h, first_ctwa_at + 72h)
//
// - Sessão 24h: janela clássica pós-inbound.
// - CTWA 72h: quando o contato veio de Click-to-WhatsApp Ads (Meta).
//   Detectamos CTWA por qualquer um dos sinais:
//     * contacts.source = 'ctwa'
//     * contacts.ad_referral_ctwa_clid IS NOT NULL
//     * contacts.utm_medium = 'ctwa'
//
// A janela CTWA usa `ad_referral_captured_at` como âncora quando presente;
// fallback para `contact.created_at`. Passe o que tiver.

export type ServiceWindowOrigin = 'ctwa' | 'session' | 'none';

export interface ContactCtwaInputs {
  source?: string | null;
  ad_referral_ctwa_clid?: string | null;
  utm_medium?: string | null;
  ad_referral_captured_at?: string | null;
  created_at?: string | null;
}

export interface ServiceWindowInput {
  lastInboundAt?: string | null;
  contact?: ContactCtwaInputs | null;
  /** Timestamp de referência (default: Date.now()). Útil para testes. */
  now?: number;
}

export interface ServiceWindow {
  originType: ServiceWindowOrigin;
  /** Milliseconds since epoch, or null quando nunca teve janela. */
  expiresAt: number | null;
  isOpen: boolean;
  /** Motivo curto para UI (chip / tooltip). */
  reason: string;
  /** Tempo restante em ms, ou 0 se fechado. */
  remainingMs: number;
  /** True se o contato é CTWA (independente da janela estar aberta). */
  isCtwaContact: boolean;
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

export function getServiceWindow(input: ServiceWindowInput): ServiceWindow {
  const now = input.now ?? Date.now();
  const contact = input.contact ?? null;
  const isCtwa = isCtwaContact(contact);
  const firstCtwaAtIso = getFirstCtwaAt(contact);

  const sessionExpires = input.lastInboundAt
    ? new Date(input.lastInboundAt).getTime() + 24 * HOUR_MS
    : null;
  const ctwaExpires = firstCtwaAtIso
    ? new Date(firstCtwaAtIso).getTime() + 72 * HOUR_MS
    : null;

  // Pick the later, but track which origin "wins".
  let expiresAt: number | null = null;
  let originType: ServiceWindowOrigin = 'none';

  if (sessionExpires && (!ctwaExpires || sessionExpires >= ctwaExpires)) {
    expiresAt = sessionExpires;
    originType = 'session';
  }
  if (ctwaExpires && (!sessionExpires || ctwaExpires > sessionExpires)) {
    expiresAt = ctwaExpires;
    originType = 'ctwa';
  }

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const isOpen = remainingMs > 0;

  let reason: string;
  if (!expiresAt) {
    reason = isCtwa ? 'CTWA sem timestamp — só template' : 'Sem inbound — só template';
  } else if (!isOpen) {
    reason = originType === 'ctwa' ? 'Fora da janela CTWA 72h' : 'Fora da janela 24h';
  } else if (originType === 'ctwa') {
    reason = `CTWA 72h — expira em ${formatRemaining(remainingMs)}`;
  } else {
    reason = `Sessão 24h — expira em ${formatRemaining(remainingMs)}`;
  }

  return { originType, expiresAt, isOpen, reason, remainingMs, isCtwaContact: isCtwa };
}

export function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
