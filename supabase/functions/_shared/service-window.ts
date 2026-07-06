// Janelas WhatsApp — versão edge (mirror de src/lib/serviceWindow.ts).
//
// Duas janelas independentes:
//   - conversationWindow (24h) — gate de freeform.
//   - billingWindow (72h CTWA) — gate de gratuidade de templates.
//
// A antiga `serviceWindow = max(24h, 72h)` foi removida. `getServiceWindow`
// segue exportada, mas `isOpen` = conversationWindow.isOpen.

export type ConversationWindowStatus = "open" | "closed" | "never";
export type BillingWindowType = "ctwa" | "normal";

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
  now?: number;
}

export interface ConversationWindow {
  status: ConversationWindowStatus;
  expiresAt: number | null;
  isOpen: boolean;
  remainingMs: number;
}

export interface BillingWindow {
  type: BillingWindowType;
  expiresAt: number | null;
  isOpen: boolean;
  remainingMs: number;
  isCtwaContact: boolean;
}

export interface ServiceWindow {
  conversation: ConversationWindow;
  billing: BillingWindow;
  isOpen: boolean;
  expiresAt: number | null;
  remainingMs: number;
  originType: "ctwa" | "session" | "none";
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

export function getConversationWindow(input: WindowInput): ConversationWindow {
  const now = input.now ?? Date.now();
  if (!input.lastInboundAt) {
    return { status: "never", expiresAt: null, isOpen: false, remainingMs: 0 };
  }
  const expiresAt = new Date(input.lastInboundAt).getTime() + 24 * HOUR_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  const isOpen = remainingMs > 0;
  return { status: isOpen ? "open" : "closed", expiresAt, isOpen, remainingMs };
}

export function getBillingWindow(input: WindowInput): BillingWindow {
  const now = input.now ?? Date.now();
  const contact = input.contact ?? null;
  const isCtwa = isCtwaContact(contact);
  const anchor = getFirstCtwaAt(contact);
  if (!isCtwa || !anchor) {
    return { type: "normal", expiresAt: null, isOpen: false, remainingMs: 0, isCtwaContact: isCtwa };
  }
  const expiresAt = new Date(anchor).getTime() + 72 * HOUR_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  return {
    type: "ctwa",
    expiresAt,
    isOpen: remainingMs > 0,
    remainingMs,
    isCtwaContact: true,
  };
}

export function getServiceWindow(input: WindowInput): ServiceWindow {
  const conversation = getConversationWindow(input);
  const billing = getBillingWindow(input);
  const originType: ServiceWindow["originType"] =
    billing.isOpen ? "ctwa" : conversation.isOpen ? "session" : "none";
  return {
    conversation,
    billing,
    isOpen: conversation.isOpen,
    expiresAt: conversation.expiresAt,
    remainingMs: conversation.remainingMs,
    originType,
    isCtwaContact: billing.isCtwaContact,
  };
}
