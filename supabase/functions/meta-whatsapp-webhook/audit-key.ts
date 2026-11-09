// Chave de idempotência da auditoria do webhook. Testes em audit-key.test.ts.
//
// Uma mensagem recebe vários status (sent, delivered, read), então o status faz parte da chave.
// Sem isso, só o primeiro ficava registrado e cada um dos outros gerava erro de chave duplicada.
export function inboundEventKey(p: {
  kind: "message" | "status" | "unknown";
  wamid: string | null;
  messageType: string | null;
}): string {
  if (p.kind === "status") return `meta:${p.wamid ?? "no-wamid"}:status:${p.messageType ?? "unknown"}`;
  return `meta:${p.wamid ?? crypto.randomUUID()}`;
}

// Reenvio da Meta: o mesmo evento já está registrado, e isso é esperado, não é falha.
export function isDuplicateAuditError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
