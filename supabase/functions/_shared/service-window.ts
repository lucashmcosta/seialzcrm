// Janela de atendimento WhatsApp — versão edge (mirror de src/lib/serviceWindow.ts).
//
// Regra:
//   expiresAt = max(last_inbound_at + 24h, first_ctwa_at + 72h)
//
// CTWA se qualquer um:
//   - contact.source = 'ctwa'
//   - contact.utm_medium = 'ctwa'
//   - contact.ad_referral_ctwa_clid IS NOT NULL
//
// Âncora CTWA: contact.ad_referral_captured_at || contact.created_at.

export type ServiceWindowOrigin = "ctwa" | "session" | "none";

export interface ContactCtwaInputs {
  source?: string | null;
  utm_medium?: string | null;
  ad_referral_ctwa_clid?: string | null;
  ad_referral_captured_at?: string | null;
  created_at?: string | null;
}

export interface ServiceWindowInput {
  lastInboundAt?: string | null;
  contact?: ContactCtwaInputs | null;
  now?: number;
}

export interface ServiceWindow {
  originType: ServiceWindowOrigin;
  expiresAt: number | null;
  isOpen: boolean;
  remainingMs: number;
  isCtwaContact: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

export function isCtwaContact(contact: ContactCtwaInputs | null | undefined): boolean {
  if (!contact) return false;
  if (contact.source && String(contact.source).toLowerCase() === "ctwa") return true;
  if (contact.ad_referral_ctwa_clid) return true;
  if (contact.utm_medium && String(contact.utm_medium).toLowerCase() === "ctwa") return true;
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

  let expiresAt: number | null = null;
  let originType: ServiceWindowOrigin = "none";

  if (sessionExpires && (!ctwaExpires || sessionExpires >= ctwaExpires)) {
    expiresAt = sessionExpires;
    originType = "session";
  }
  if (ctwaExpires && (!sessionExpires || ctwaExpires > sessionExpires)) {
    expiresAt = ctwaExpires;
    originType = "ctwa";
  }

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const isOpen = remainingMs > 0;

  return {
    originType,
    expiresAt,
    isOpen,
    remainingMs,
    isCtwaContact: isCtwa,
  };
}
