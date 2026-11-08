// Deduplicação de eventos de negócio da CAPI (Lead por contato, Purchase por oportunidade).
//
// Problema: o event_id carregava o timestamp do envio → o mesmo Lead reenviado (trigger de
// INSERT + trigger de UPDATE, backfill manual, reenvio fora do retry) virava um evento NOVO
// para a Meta e contava em dobro.
//
// Desenho:
//  - event_id determinístico p/ eventos de negócio: Lead → `${org}:Lead:${contact_id}`,
//    Purchase → `${org}:Purchase:${opportunity_id}`. Demais eventos e eventos de TESTE
//    (body.test ou test_event_code configurado) mantêm o id legado (único por envio).
//  - Guard antes de chamar a Meta: se já existe linha `sent` NÃO-teste para o mesmo
//    org+event_id (ou, p/ linhas legadas com id timestampado, p/ o mesmo contato/oportunidade)
//    → não chama a Meta, não insere linha, devolve {skipped:'duplicate'}.
//  - Corrida (dois disparos simultâneos): o índice único JÁ existente em prod
//    `capi_event_log_unique_event_per_org (organization_id, event_id)` faz o 2º INSERT falhar
//    com 23505; o perdedor relê a linha e decide (sent → duplicate; pending recente →
//    in_flight; failed/permanent_failure/pending velho → assume a linha com UPDATE condicional).
//    Só quem "possui" a linha chama a Meta.

// deno-lint-ignore no-explicit-any
export type AdminClient = any;
// deno-lint-ignore no-explicit-any
export type LogRow = Record<string, any>;

// Janela em que uma linha `pending` é considerada "em voo" (outro request mandando agora).
export const IN_FLIGHT_MS = 2 * 60 * 1000;

export function isTestSend(bodyTest: unknown, testEventCode: unknown): boolean {
  return bodyTest === true || bodyTest === "true" || !!testEventCode;
}

// Código de teste vale só para este envio: nunca é salvo na configuração da org.
// Reenvio de uma linha de teste mantém o código dela, senão a falha de um teste seria
// reenviada como evento real. Código digitado só vale em envio marcado como teste.
export function resolveTestEventCode(p: {
  bodyTest: unknown;
  bodyCode: unknown;
  savedCode: unknown;
  logRowCode?: unknown;
}): string | null {
  const rowCode = typeof p.logRowCode === "string" ? p.logRowCode.trim() : "";
  if (rowCode) return rowCode;
  const isTest = p.bodyTest === true || p.bodyTest === "true";
  const code = isTest && typeof p.bodyCode === "string" ? p.bodyCode.trim() : "";
  if (/^[A-Za-z0-9_-]{1,64}$/.test(code)) return code;
  return typeof p.savedCode === "string" && p.savedCode.trim() ? p.savedCode.trim() : null;
}

// Teste sem código entraria no Pixel como evento real, e não dá para apagar da Meta.
// Reenvio (logRow) não passa por aqui: segue a regra da própria linha.
export function testNeedsCode(bodyTest: unknown, testEventCode: string | null, hasLogRow: boolean): boolean {
  return !hasLogRow && (bodyTest === true || bodyTest === "true") && !testEventCode;
}

// Chave de negócio do evento. null = evento sem dedup (id legado).
export function deterministicEventId(
  organizationId: string,
  eventName: string,
  contactId?: string | null,
  opportunityId?: string | null,
): string | null {
  if (eventName === "Lead" && contactId) return `${organizationId}:Lead:${contactId}`;
  if (eventName === "Purchase" && opportunityId) return `${organizationId}:Purchase:${opportunityId}`;
  return null;
}

export function legacyEventId(
  organizationId: string,
  eventName: string,
  contactId: string | null | undefined,
  opportunityId: string | null | undefined,
  eventTime: number,
): string {
  return `${organizationId}:${eventName}:${contactId || "x"}:${opportunityId || "x"}:${eventTime}`;
}

export interface EventIdDecision {
  eventId: string;
  // true = evento de negócio real → aplica guard de duplicidade
  dedup: boolean;
}

export function resolveEventId(p: {
  logRow?: LogRow | null;
  organizationId: string;
  eventName: string;
  contactId?: string | null;
  opportunityId?: string | null;
  isTest: boolean;
  eventTime: number;
}): EventIdDecision {
  const key = deterministicEventId(p.organizationId, p.eventName, p.contactId, p.opportunityId);
  const dedup = !p.isTest && key !== null;
  // Retry/reprocessamento: SEMPRE reaproveita o event_id da linha (Meta deduplica pelo mesmo id).
  if (p.logRow?.event_id) return { eventId: String(p.logRow.event_id), dedup };
  if (dedup) return { eventId: key!, dedup };
  return {
    eventId: legacyEventId(p.organizationId, p.eventName, p.contactId, p.opportunityId, p.eventTime),
    dedup: false,
  };
}

// Linha que de fato contou como evento real na Meta (enviada e sem test_event_code).
export function isRealSentRow(row: LogRow | null | undefined): boolean {
  if (!row || row.status !== "sent") return false;
  if (row.test_event_code) return false;
  const p = row.payload;
  if (p && typeof p === "object" && p.test_event_code) return false;
  return true;
}

const DUP_COLS = "id, event_id, status, test_event_code, payload, attempt_count, last_attempt_at, updated_at";

// Procura envio real anterior do MESMO evento de negócio (read-only).
// 1) mesmo org+event_id (ids determinísticos);
// 2) legado: mesmo org+event_name+contato (Lead) / oportunidade (Purchase), status sent,
//    sem test_event_code — cobre as linhas com id timestampado anteriores a este deploy.
export async function findSentDuplicate(admin: AdminClient, p: {
  organizationId: string;
  eventName: string;
  eventId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  excludeId?: string | null;
}): Promise<LogRow | null> {
  const { data: byId, error: e1 } = await admin
    .from("capi_event_log")
    .select(DUP_COLS)
    .eq("organization_id", p.organizationId)
    .eq("event_id", p.eventId)
    .maybeSingle();
  if (e1) throw e1;
  if (byId && byId.id !== p.excludeId && isRealSentRow(byId)) return byId;

  const col = p.eventName === "Lead" ? "contact_id" : p.eventName === "Purchase" ? "opportunity_id" : null;
  const val = col === "contact_id" ? p.contactId : col === "opportunity_id" ? p.opportunityId : null;
  if (!col || !val) return null;

  const { data: rows, error: e2 } = await admin
    .from("capi_event_log")
    .select(DUP_COLS)
    .eq("organization_id", p.organizationId)
    .eq("event_name", p.eventName)
    .eq(col, val)
    .eq("status", "sent")
    .is("test_event_code", null)
    .limit(5);
  if (e2) throw e2;
  return (rows || []).find((r: LogRow) => r.id !== p.excludeId && isRealSentRow(r)) ?? null;
}

export type ClaimResult =
  | { kind: "claimed"; id: string; attemptCount: number }
  | { kind: "skip"; reason: "duplicate" | "in_flight"; id: string };

// Insere a linha do envio. Em conflito no índice único (org,event_id) decide quem envia.
export async function claimLogRow(
  admin: AdminClient,
  baseLog: LogRow,
  now: Date = new Date(),
): Promise<ClaimResult> {
  const nowIso = now.toISOString();
  const { data: ins, error } = await admin
    .from("capi_event_log")
    .insert({ ...baseLog, status: "pending", attempt_count: 1, last_attempt_at: nowIso })
    .select("id")
    .single();
  if (!error && ins) return { kind: "claimed", id: ins.id, attemptCount: 1 };
  if (error?.code !== "23505") throw error ?? new Error("capi_event_log insert failed");

  const { data: existing, error: selErr } = await admin
    .from("capi_event_log")
    .select(DUP_COLS)
    .eq("organization_id", baseLog.organization_id)
    .eq("event_id", baseLog.event_id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!existing) throw error; // conflito sem linha visível: deixa estourar (500) — não envia

  if (isRealSentRow(existing)) return { kind: "skip", reason: "duplicate", id: existing.id };
  if (existing.status === "sent") {
    // Linha de teste com o mesmo id (não deveria ocorrer: testes usam id legado). Não sobrescreve.
    return { kind: "skip", reason: "duplicate", id: existing.id };
  }
  const lastAttempt = existing.last_attempt_at ? new Date(existing.last_attempt_at).getTime() : 0;
  if (existing.status === "pending" && now.getTime() - lastAttempt < IN_FLIGHT_MS) {
    return { kind: "skip", reason: "in_flight", id: existing.id };
  }

  // failed / retrying / permanent_failure / pending velho → assume a linha. UPDATE condicional
  // (compare-and-set) no status + updated_at lidos: se outro request assumiu antes, o
  // updated_at mudou (trigger capi_event_log_set_updated_at) → 0 linhas → in_flight.
  const attemptCount = (existing.attempt_count || 0) + 1;
  const { data: upd, error: updErr } = await admin
    .from("capi_event_log")
    .update({
      ...baseLog,
      status: "pending",
      attempt_count: attemptCount,
      last_attempt_at: nowIso,
      meta_error: null,
      meta_response: null,
    })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .eq("updated_at", existing.updated_at)
    .select("id");
  if (updErr) throw updErr;
  if (!upd || upd.length === 0) return { kind: "skip", reason: "in_flight", id: existing.id };
  return { kind: "claimed", id: existing.id, attemptCount };
}
