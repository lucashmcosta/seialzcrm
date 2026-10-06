// Regras puras da edição de mensagem Evolution (V1 piloto).
// A Edge Function é a autoridade final; o frontend só espelha para UX.

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_TEXT = 4096;
export const PROVIDER = "evolution_api";

export interface MsgRow {
  id: string;
  organization_id: string;
  thread_id: string | null;
  sender_user_id: string | null;
  sender_type: string | null;
  direction: string | null;
  content: string | null;
  sent_at: string | null;
  deleted_at: string | null;
  is_internal_note: boolean | null;
  template_id: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_code: string | null;
  whatsapp_status: string | null;
  whatsapp_message_sid: string | null;
  endpoint_id: string | null;
  edit_count: number | null;
  // deno-lint-ignore no-explicit-any
  metadata: any;
}

export type RuleError =
  | "not_author"
  | "not_editable"
  | "edit_window_expired"
  | "content_unchanged"
  | "remote_jid_invalid";

export function checkEditable(m: MsgRow, userId: string, newText: string, now: number): RuleError | null {
  if (m.sender_user_id !== userId || m.sender_type !== "user") return "not_author";
  if (
    m.direction !== "outbound" || m.deleted_at || m.is_internal_note === true || m.template_id ||
    (m.media_urls && m.media_urls.length > 0) || m.media_type || m.error_code ||
    m.whatsapp_status === "failed" || !m.whatsapp_message_sid || !m.sent_at
  ) return "not_editable";
  const sent = Date.parse(m.sent_at);
  if (!Number.isFinite(sent) || now - sent > EDIT_WINDOW_MS || now < sent - 60_000) return "edit_window_expired";
  if ((m.content ?? "") === newText) return "content_unchanged";
  return null;
}

/** Valida e devolve a key salva no envio; fail-closed. */
export function resolveEditKey(m: MsgRow): { remoteJid: string; id: string; number: string; instanceName: string | null } | null {
  const evo = m.metadata?.evolution;
  const key = evo?.response?.key;
  const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : "";
  const match = /^(\d{8,15})@s\.whatsapp\.net$/.exec(remoteJid);
  if (!match) return null;
  if (key?.fromMe !== true) return null;
  if (key?.id !== m.whatsapp_message_sid) return null;
  const to = typeof evo?.to === "string" ? evo.to.replace(/\D/g, "") : "";
  if (!to || to !== match[1]) return null;
  if (evo?.endpoint_id && m.endpoint_id && evo.endpoint_id !== m.endpoint_id) return null;
  return { remoteJid, id: key.id, number: to, instanceName: typeof evo?.instance_name === "string" ? evo.instance_name : null };
}

/** 200 + PENDING não confirma aplicação; aqui só verificamos que foi ACEITA/submetida. */
// deno-lint-ignore no-explicit-any
export function acceptedEdit(data: any, originalId: string): { editKeyId: string | null } | null {
  const pm = data?.message?.protocolMessage;
  if (!pm || pm.type !== "MESSAGE_EDIT") return null;
  if (pm.key?.id !== originalId) return null;
  return { editKeyId: typeof data?.key?.id === "string" ? data.key.id : null };
}
