// Funções puras do proxy da equipe para o portal-staff do App.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALLOWED_OPS = [
  "conversations.list",
  "messages.list",
  "messages.send",
  "attachment.prepare",
  "conversation.read",
  "conversation.resolve",
  "conversation.reopen",
  "conversation.assign",
] as const;
export type Op = typeof ALLOWED_OPS[number];

/** Operações que mudam algo exigem permissão de editar Atendimento. */
export const WRITE_OPS: ReadonlySet<Op> = new Set<Op>([
  "messages.send", "attachment.prepare", "conversation.resolve", "conversation.reopen", "conversation.assign",
]);

export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];
export const MAX_SIZE = 10 * 1024 * 1024;

export type Staff = { userId: string; displayName: string };
type R = Record<string, unknown>;
const isUuid = (v: unknown) => typeof v === "string" && UUID_RE.test(v);
const optStr = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.length <= max);

/** Retorna os parâmetros permitidos da operação, ou null se inválidos. Nunca aceita organizationId/staff. */
export function sanitizeParams(op: Op, raw: unknown, staff: Staff): R | null {
  const p = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw as R : {};
  switch (op) {
    case "conversations.list":
      if (p.status !== undefined && p.status !== "open" && p.status !== "resolved") return null;
      if (!optStr(p.cursor, 500)) return null;
      return { ...(p.status ? { status: p.status } : {}), ...(p.cursor ? { cursor: p.cursor } : {}) };
    case "messages.list":
      if (!isUuid(p.conversationId) || !optStr(p.before, 200)) return null;
      return { conversationId: p.conversationId, ...(p.before ? { before: p.before } : {}) };
    case "messages.send": {
      if (!isUuid(p.conversationId) || !isUuid(p.clientMessageId)) return null;
      if (!optStr(p.body, 4000) || !optStr(p.storagePath, 500)) return null;
      const body = typeof p.body === "string" ? p.body.trim() : "";
      if (!body && !p.storagePath) return null;
      return {
        conversationId: p.conversationId, clientMessageId: p.clientMessageId,
        ...(body ? { body } : {}), ...(p.storagePath ? { storagePath: p.storagePath } : {}),
      };
    }
    case "attachment.prepare":
      if (!isUuid(p.conversationId)) return null;
      if (typeof p.name !== "string" || !p.name || p.name.length > 200) return null;
      if (typeof p.mimeType !== "string" || !ALLOWED_MIME.includes(p.mimeType)) return null;
      if (typeof p.size !== "number" || p.size <= 0 || p.size > MAX_SIZE) return null;
      return { conversationId: p.conversationId, name: p.name, mimeType: p.mimeType, size: p.size };
    case "conversation.read":
    case "conversation.resolve":
    case "conversation.reopen":
      if (!isUuid(p.conversationId)) return null;
      return { conversationId: p.conversationId };
    case "conversation.assign": {
      if (!isUuid(p.conversationId)) return null;
      if (p.assignee === null) return { conversationId: p.conversationId, assignee: null };
      const a = p.assignee as R | undefined;
      // Só "atribuir a mim": o responsável é sempre o próprio usuário da sessão.
      if (!a || a.userId !== staff.userId) return null;
      return { conversationId: p.conversationId, assignee: { userId: staff.userId, name: staff.displayName } };
    }
  }
}

export function isAllowedOp(op: unknown): op is Op {
  return typeof op === "string" && (ALLOWED_OPS as readonly string[]).includes(op);
}

export function buildStaffBody(organizationId: string, staff: Staff, op: Op, params: R): string {
  return JSON.stringify({ organizationId, staff, op, ...params });
}
