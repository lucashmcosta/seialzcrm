// Funções puras da client-portal-whatsapp-preview (somente leitura, sem I/O).
// NUNCA logar conteúdo de mensagens, telefone ou corpo da requisição.
export { verifySignature, FORBIDDEN_ENDPOINT_ID } from "../client-portal-otp-send/logic.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 30;
export const FALLBACK_LABEL = "Equipe Central";
const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

export type PreviewInput = { contactIds: string[]; limit: number };

export function validatePreviewInput(body: unknown): PreviewInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const ids = b.seialz_contact_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5) return null;
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) return null;
  let limit = DEFAULT_LIMIT;
  if (b.limit !== undefined) {
    if (typeof b.limit !== "number" || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > MAX_LIMIT) return null;
    limit = b.limit;
  }
  return { contactIds: Array.from(new Set(ids as string[])), limit };
}

export type ThreadRow = { id: string; channel: string | null; primary_endpoint_id: string | null };
export type MessageRow = {
  id: string;
  thread_id: string;
  direction: string | null;
  content: string | null;
  media_type: string | null;
  created_at: string | null;
  sender_type: string | null;
  sender_user_id: string | null;
  is_internal_note: boolean | null;
  deleted_at: string | null;
  [k: string]: unknown;
};
export type PreviewMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_type: string | null;
  created_at: string | null;
  sender_label: string | null;
};

export function allowedThreadIds(threads: ThreadRow[], endpointId: string): string[] {
  return threads
    .filter((t) => t.channel === "whatsapp" && t.primary_endpoint_id === endpointId)
    .map((t) => t.id);
}

export function firstName(full: string | null | undefined): string | null {
  const f = (full ?? "").trim().split(/\s+/)[0];
  return f ? f : null;
}

/** Filtra e projeta mensagens; nunca inclui media_urls nem outros campos. */
export function buildPreview(
  messages: MessageRow[],
  threadIds: string[],
  userNames: Map<string, string>,
  limit: number,
): PreviewMessage[] {
  const allowed = new Set(threadIds);
  return messages
    .filter((m) =>
      allowed.has(m.thread_id) &&
      m.is_internal_note !== true &&
      m.deleted_at == null &&
      m.sender_type !== "system" &&
      (m.direction === "inbound" || m.direction === "outbound")
    )
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit)
    .map((m) => {
      const outbound = m.direction === "outbound";
      const body = (m.content ?? "").trim() ? m.content : null;
      const mt = m.media_type && MEDIA_TYPES.has(m.media_type) ? m.media_type : null;
      return {
        id: m.id,
        direction: outbound ? "outbound" : "inbound",
        body,
        media_type: mt,
        created_at: m.created_at,
        sender_label: outbound
          ? (m.sender_user_id && firstName(userNames.get(m.sender_user_id))) || FALLBACK_LABEL
          : null,
      };
    });
}
