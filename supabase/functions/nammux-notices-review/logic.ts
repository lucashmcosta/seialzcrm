// Funções puras da tela de revisão dos avisos ao cliente.

/** O que a tela mostra: aguardando aprovação, resultado incerto, tentativas esgotadas, e o que parou sem sair. */
export const REVIEW_STATUSES = ["pending_approval", "needs_review", "dead_letter"] as const;
/** Avisos que pararam sem sair (falta de modelo, telefone, número) ficam visíveis por estes dias. */
export const SKIPPED_VISIBLE_DAYS = 7;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export type ReviewRequest =
  | { op: "list"; organizationId: string }
  | { op: "decide"; organizationId: string; noticeId: string; approve: boolean; reason: string | null };

export function parseRequest(body: unknown): ReviewRequest | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!isUuid(b.organizationId)) return null;
  if (b.op === "list") return { op: "list", organizationId: b.organizationId };
  if (b.op === "decide") {
    if (!isUuid(b.noticeId) || typeof b.approve !== "boolean") return null;
    if (b.reason !== undefined && b.reason !== null && (typeof b.reason !== "string" || b.reason.length > 300)) return null;
    const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
    return { op: "decide", organizationId: b.organizationId, noticeId: b.noticeId, approve: b.approve, reason };
  }
  return null;
}

/** Só o aviso que ainda pode sair é aprovável. O que já saiu e ficou desmentido só recebe baixa. */
export function canApprove(status: string, statusReason: string | null, expiresAt: string | null, now: Date): boolean {
  if (status !== "pending_approval" && status !== "needs_review" && status !== "dead_letter") return false;
  if (statusReason === "payment_reversed_after_sent") return false;
  if (expiresAt && new Date(expiresAt).getTime() < now.getTime()) return false;
  return true;
}

/** Erro da RPC nammux_notice_decide em código para a tela. */
export function decideErrorCode(message: string | null | undefined): { status: number; code: string } {
  const m = message ?? "";
  if (m.includes("NAMMUX_NOTICE_SEM_PERMISSAO")) return { status: 403, code: "forbidden" };
  if (m.includes("NAMMUX_NOTICE_NAO_ENCONTRADO")) return { status: 404, code: "not_found" };
  if (m.includes("NAMMUX_NOTICE_JA_DECIDIDO")) return { status: 409, code: "already_decided" };
  if (m.includes("NAMMUX_NOTICE_NAO_REENVIAVEL")) return { status: 409, code: "not_resendable" };
  return { status: 500, code: "decide_failed" };
}
