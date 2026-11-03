// Funções puras do aviso do chat do App. O aviso nunca traz texto da mensagem.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NotifyInput = {
  organizationId: string;
  conversationId: string;
  seialzContactId: string;
  event: "message.created" | "conversation.updated";
  lastMessageAt: string;
  lastFrom: "client" | "staff";
  unreadForStaff: number;
};

export function validateNotify(body: unknown): NotifyInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  for (const k of ["organizationId", "conversationId", "seialzContactId"]) {
    if (typeof b[k] !== "string" || !UUID_RE.test(b[k] as string)) return null;
  }
  if (b.event !== "message.created" && b.event !== "conversation.updated") return null;
  if (b.lastFrom !== "client" && b.lastFrom !== "staff") return null;
  if (typeof b.lastMessageAt !== "string" || Number.isNaN(Date.parse(b.lastMessageAt))) return null;
  if (typeof b.unreadForStaff !== "number" || !Number.isInteger(b.unreadForStaff) || b.unreadForStaff < 0) return null;
  return {
    organizationId: b.organizationId as string,
    conversationId: b.conversationId as string,
    seialzContactId: b.seialzContactId as string,
    event: b.event,
    lastMessageAt: new Date(b.lastMessageAt).toISOString(),
    lastFrom: b.lastFrom,
    unreadForStaff: b.unreadForStaff,
  };
}

/** Aviso mais antigo que o estado guardado é ignorado. */
export function isStale(storedLastMessageAt: string | null | undefined, incoming: string): boolean {
  if (!storedLastMessageAt) return false;
  return Date.parse(incoming) < Date.parse(storedLastMessageAt);
}

/** Notifica só mensagem nova do cliente. */
export function shouldNotify(input: Pick<NotifyInput, "event" | "lastFrom">): boolean {
  return input.event === "message.created" && input.lastFrom === "client";
}

/** Com responsável: só ele. Sem responsável: todos do Atendimento. */
export function pickRecipients(assignedUserId: string | null | undefined, atendimentoUserIds: string[]): string[] {
  if (assignedUserId) return [assignedUserId];
  return Array.from(new Set(atendimentoUserIds));
}

export const NOTIFICATION_TITLE = "Nova mensagem no App do cliente";
