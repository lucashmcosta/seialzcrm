// Bloqueio de envio visto no próprio envio (sem prazo fixo).
// A Meta não manda webhook com o resultado do recurso nem com o fim antecipado de uma
// restrição, e o health_status da WABA não mostra a restrição por spam. O sinal confiável
// é a resposta da Meta a cada mensagem:
//  - status "failed" com código de conta bloqueada → bloqueado desde agora;
//  - status "sent" de uma mensagem enviada depois disso → liberado de novo
//    (fim do prazo, recurso aceito ou qualquer outro motivo).
// A data de término informada no ACCOUNT_RESTRICTION fica só como referência na tela.
// Sem dependências de Deno (testável).

/** 131031: "Business Account locked". 368: "Temporarily blocked for policies violations". */
export const LOCK_ERROR_CODES = new Set([131031, 368]);

export interface SendBlock {
  since: string;
  error_code: number | null;
  error_title: string | null;
}

export type SendBlockTransition = "block" | "unblock" | null;

export function isLockFailure(status: any): boolean {
  return status?.status === "failed" && LOCK_ERROR_CODES.has(Number(status?.errors?.[0]?.code));
}

/**
 * O que um status de mensagem muda no bloqueio. "read"/"delivered" não liberam: podem ser de
 * mensagens antigas, lidas depois do bloqueio. Só "sent" de mensagem posterior ao bloqueio libera.
 */
export function sendBlockTransition(status: any, current: Pick<SendBlock, "since"> | null | undefined): SendBlockTransition {
  if (isLockFailure(status)) return current?.since ? null : "block";
  if (status?.status === "sent" && current?.since) {
    const sentAt = Number(status?.timestamp) * 1000;
    const since = Date.parse(current.since);
    return Number.isFinite(sentAt) && Number.isFinite(since) && sentAt > since ? "unblock" : null;
  }
  return null;
}

export function sendBlockFromStatus(status: any, now = new Date()): SendBlock {
  const e = status?.errors?.[0] ?? {};
  const code = Number(e.code);
  return {
    since: now.toISOString(),
    error_code: Number.isFinite(code) ? code : null,
    error_title: (e.title ?? e.message ?? null) as string | null,
  };
}

export interface MetaRestriction {
  state: "RESTRICTED" | "DISABLE" | "SCHEDULE_FOR_DISABLE";
  types: string[];
  /** Previsão informada pela Meta. Pode mudar com o recurso: nunca usar para decidir nada. */
  expires_at: string | null;
  remediation: string | null;
  received_at: string;
}

/**
 * Estado da conta a partir de um account_update.
 * - restriction: gravar (ACCOUNT_RESTRICTION ou DISABLED_UPDATE com DISABLE/SCHEDULE_FOR_DISABLE);
 * - reinstate: limpar restrição e bloqueio (DISABLED_UPDATE com REINSTATE);
 * - null: o evento não muda o estado.
 */
export function accountStateFromUpdate(
  value: any,
  now = new Date(),
): { kind: "restriction"; restriction: MetaRestriction } | { kind: "reinstate" } | null {
  const event = String(value?.event ?? "").toUpperCase();
  if (event === "ACCOUNT_RESTRICTION") {
    const infos = Array.isArray(value?.restriction_info) ? value.restriction_info : [];
    const expirations = infos.map((r: any) => Number(r?.expiration)).filter((n: number) => Number.isFinite(n) && n > 0);
    return {
      kind: "restriction",
      restriction: {
        state: "RESTRICTED",
        types: infos.map((r: any) => String(r?.restriction_type ?? "")).filter(Boolean),
        expires_at: expirations.length ? new Date(Math.max(...expirations) * 1000).toISOString() : null,
        remediation: infos.map((r: any) => r?.remediation).find((x: unknown) => typeof x === "string" && x) ?? null,
        received_at: now.toISOString(),
      },
    };
  }
  if (event === "DISABLED_UPDATE") {
    const ban = String(value?.ban_info?.waba_ban_state ?? "").toUpperCase();
    if (ban === "REINSTATE") return { kind: "reinstate" };
    if (ban === "DISABLE" || ban === "SCHEDULE_FOR_DISABLE") {
      return {
        kind: "restriction",
        restriction: { state: ban, types: [], expires_at: null, remediation: null, received_at: now.toISOString() },
      };
    }
  }
  return null;
}
