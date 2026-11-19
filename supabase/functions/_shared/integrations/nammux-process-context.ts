// Processos do cliente vindos do Nammux, para o agente de atendimento responder com dado real.
// Lê só o que a integração já grava (nammux_process_snapshots, via nammux-webhook-ingest).
// Fica na integração: o núcleo do Seialz não conhece o Nammux.
import { meetingLinkText } from "./meeting-link.ts";
import { safeZone, zoneNote } from "./nammux-timezone.ts";

export interface NammuxProcessRow {
  cnj: string | null;
  process_title: string | null;
  phase: string | null;
  stage_name: string | null;
  status_name: string | null;
  status_changed_at: string | null;
  responsible_name: string | null;
  distributed_at: string | null;
  source_updated_at: string | null;
  last_synced_at: string | null;
}

export function day(iso: string | null): string | null {
  if (!iso) return null;
  // Campo só-data (ex.: distributed_at): não tem hora nem fuso. Passar por Date
  // lê como meia-noite UTC e, em Brasília, mostra o dia anterior.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Assuntos que já têm bloco próprio no prompt (e por isso saem do aviso "não invente"). */
export interface NammuxCovered {
  agenda?: boolean;
  finance?: boolean;
  movements?: boolean;
}

function uncoveredTopics(covered: NammuxCovered): string {
  const topics: string[] = [];
  if (!covered.agenda) topics.push("data de audiência", "link");
  if (!covered.finance) topics.push("valor", "pagamento");
  if (!covered.movements) topics.push("movimentação do tribunal");
  return topics.length ? ` (${topics.join(", ")})` : "";
}

/**
 * Bloco do prompt com os processos. Vazio quando não há processo do Nammux.
 * Sem `covered`, o texto é o mesmo de antes dos blocos novos.
 */
export function nammuxProcessBlock(rows: NammuxProcessRow[], covered: NammuxCovered = {}): string {
  if (!rows.length) return "";
  const lines = rows.map((r, i) => {
    const parts = [
      `${i + 1}. ${r.process_title || "Processo"}`,
      r.cnj ? `número ${r.cnj}` : "ainda sem número (não distribuído)",
      r.stage_name ? `etapa: ${r.stage_name}` : null,
      r.status_name ? `situação: ${r.status_name}` : null,
      day(r.status_changed_at) ? `desde ${day(r.status_changed_at)}` : null,
      day(r.distributed_at) ? `distribuído em ${day(r.distributed_at)}` : null,
      r.responsible_name ? `responsável no escritório: ${r.responsible_name}` : null,
      day(r.source_updated_at ?? r.last_synced_at) ? `atualizado no sistema em ${day(r.source_updated_at ?? r.last_synced_at)}` : null,
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  });
  return `
## PROCESSOS DO CLIENTE (sistema do escritório)
${lines.join("\n")}
Use só estes dados para falar do processo. Se o cliente perguntar algo que não está aqui${uncoveredTopics(covered)}, não invente: diga o que você sabe e passe para a equipe.
`;
}

// ---------- Agenda (process.agenda.changed) ----------

export interface NammuxAgendaRow {
  opportunity_id: string;
  event_type: string;
  subtype: string | null;
  start_at: string;
  all_day: boolean;
  timezone: string | null;
  modality: string | null;
  location: string | null;
  virtual_link: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  audiencia: "Audiência",
  pericia: "Perícia",
  entrevista: "Entrevista",
};

/**
 * "quinta-feira, 10/12/2026 às 10:00 (horário de Brasília)"; dia inteiro sai sem hora.
 * Tribunal em outro fuso: a hora é a LOCAL, com a de Brasília ao lado —
 * "às 09:00 (horário de Cuiabá; 10:00 no horário de Brasília)".
 */
export function agendaWhen(iso: string, allDay: boolean, timezone: string | null): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const tz = safeZone(timezone);
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
  if (allDay) return `${date} (horário ainda não definido)`;
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} às ${time} (${zoneNote(iso, tz)})`;
}

/**
 * Bloco com as próximas datas. `processIndex` liga o negócio ao número do
 * processo no bloco PROCESSOS DO CLIENTE (só usado quando há mais de um).
 */
export function nammuxAgendaBlock(rows: NammuxAgendaRow[], processIndex: Record<string, number> = {}): string {
  const multi = new Set(Object.values(processIndex)).size > 1;
  const lines = rows.map((r) => {
    const when = agendaWhen(r.start_at, r.all_day, r.timezone);
    if (!when) return null;
    const label = EVENT_LABEL[r.event_type] ?? "Compromisso";
    const parts = [
      r.subtype ? `${label} (${r.subtype})` : label,
      when,
      r.modality ? `modalidade: ${r.modality}` : null,
      r.location ? `local: ${r.location}` : null,
      meetingLinkText(r.virtual_link) ? `link: ${meetingLinkText(r.virtual_link)}` : null,
      multi && processIndex[r.opportunity_id] ? `processo ${processIndex[r.opportunity_id]}` : null,
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  }).filter(Boolean);

  if (!lines.length) {
    return `
## PRÓXIMAS DATAS DO PROCESSO (agenda do escritório)
Não há audiência, perícia ou entrevista marcada no momento. Se o cliente perguntar por uma data, diga que ainda não há data marcada e que ele será avisado quando houver.
`;
  }
  return `
## PRÓXIMAS DATAS DO PROCESSO (agenda do escritório)
${lines.join("\n")}
São as datas marcadas hoje no sistema do escritório. Informe a data, a hora e o link ou local exatamente como estão aqui. Se o cliente perguntar por uma data que não está na lista, diga que ainda não há data marcada.
`;
}

// deno-lint-ignore no-explicit-any
export async function loadNammuxAgenda(supabase: any, organizationId: string, opportunityIds: string[], now = new Date()): Promise<NammuxAgendaRow[]> {
  if (!opportunityIds.length) return [];
  // Duas horas de folga para trás: uma audiência que acabou de começar ainda é assunto.
  const since = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("nammux_process_events")
    .select("opportunity_id, event_type, subtype, start_at, all_day, timezone, modality, location, virtual_link")
    .eq("organization_id", organizationId)
    .in("opportunity_id", opportunityIds)
    .eq("status", "pendente")
    .is("removed_at", null)
    .gte("start_at", since)
    .order("start_at", { ascending: true })
    .limit(10);
  if (error) {
    console.warn("[nammux-process-context] não leu a agenda", error.code ?? "sem_codigo");
    return [];
  }
  return (data ?? []) as NammuxAgendaRow[];
}

// ---------- Financeiro (process.finance.changed) ----------

export interface NammuxFinanceRow {
  opportunity_id: string;
  kind: "agreement" | "installment" | "payout";
  external_id: string;
  parent_external_id: string | null;
  status: string | null;
  agreed_on: string | null;
  homologated_on: string | null;
  installments_count: number | null;
  number: number | null;
  due_date: string | null;
  effective_due_date: string | null;
  client_amount: number | string | null;
  paid_on: string | null;
  manifestation_due_date: string | null;
  amount: number | string | null;
  reversed: boolean | null;
}

/** "R$ 1.400,00". Nulo ou não numérico devolve null. */
export function brl(value: number | string | null): string | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\u00a0/g, " ");
}

function installmentLine(r: NammuxFinanceRow, total: number | null): string {
  const venc = day(r.due_date);
  const situacao = r.status === "paid"
    ? (day(r.paid_on) ? `paga em ${day(r.paid_on)}` : "paga")
    : r.status === "overdue"
    ? (day(r.manifestation_due_date)
      ? `venceu e não foi paga; o escritório vai se manifestar no processo até ${day(r.manifestation_due_date)}`
      : "venceu e não foi paga")
    : r.status === "partially_paid"
    ? "paga em parte"
    : r.status === "cancelled"
    ? "cancelada"
    : "ainda não venceu";
  const parts = [
    `Parcela ${r.number ?? "?"}${total ? ` de ${total}` : ""}`,
    venc ? `vencimento ${venc}` : null,
    situacao,
    brl(r.client_amount) ? `parte do cliente: ${brl(r.client_amount)}` : null,
  ].filter(Boolean);
  return `  - ${parts.join(" · ")}`;
}

/** Bloco com acordo, parcelas e repasses. Vazio quando o processo não tem acordo nem repasse. */
export function nammuxFinanceBlock(rows: NammuxFinanceRow[], processIndex: Record<string, number> = {}): string {
  const multi = new Set(Object.values(processIndex)).size > 1;
  const agreements = rows.filter((r) => r.kind === "agreement" && r.status !== "cancelado" && r.status !== "substituido");
  const payouts = rows.filter((r) => r.kind === "payout" && !r.reversed);
  const lines: string[] = [];

  for (const a of agreements) {
    const head = [
      day(a.agreed_on) ? `Acordo fechado em ${day(a.agreed_on)}` : "Acordo",
      day(a.homologated_on) ? `homologado pelo juiz em ${day(a.homologated_on)}` : "ainda não homologado pelo juiz",
      a.installments_count ? `${a.installments_count} parcela${a.installments_count === 1 ? "" : "s"}` : null,
      multi && processIndex[a.opportunity_id] ? `processo ${processIndex[a.opportunity_id]}` : null,
    ].filter(Boolean);
    lines.push(`- ${head.join(" · ")}`);
    rows
      .filter((r) => r.kind === "installment" && r.parent_external_id === a.external_id)
      .sort((x, y) => (x.number ?? 0) - (y.number ?? 0))
      .forEach((r) => lines.push(installmentLine(r, a.installments_count)));
  }
  for (const p of payouts) {
    const parts = [
      "Repasse ao cliente",
      brl(p.amount),
      day(p.paid_on) ? `em ${day(p.paid_on)}` : null,
      multi && processIndex[p.opportunity_id] ? `processo ${processIndex[p.opportunity_id]}` : null,
    ].filter(Boolean);
    lines.push(`- ${parts.join(" · ")}`);
  }
  if (!lines.length) return "";
  return `
## ACORDO E PAGAMENTOS (financeiro do escritório)
${lines.join("\n")}
Os valores são a parte do cliente. Informe só o que está aqui: não calcule, não some e não estime valor nem data que não apareça na lista. Dúvida sobre valor ou desconto, passe para a equipe.
`;
}

// deno-lint-ignore no-explicit-any
export async function loadNammuxFinance(supabase: any, organizationId: string, opportunityIds: string[]): Promise<NammuxFinanceRow[]> {
  if (!opportunityIds.length) return [];
  const { data, error } = await supabase.from("nammux_process_finance")
    .select("opportunity_id, kind, external_id, parent_external_id, status, agreed_on, homologated_on, installments_count, number, due_date, effective_due_date, client_amount, paid_on, manifestation_due_date, amount, reversed")
    .eq("organization_id", organizationId)
    .in("opportunity_id", opportunityIds)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) {
    console.warn("[nammux-process-context] não leu o financeiro", error.code ?? "sem_codigo");
    return [];
  }
  return (data ?? []) as NammuxFinanceRow[];
}

// ---------- Movimentações (process.movement.added) ----------

export interface NammuxMovementRow {
  opportunity_id: string;
  occurred_at: string;
  text: string;
}

/** Bloco com as últimas movimentações relevantes. Vazio quando não há nenhuma. */
export function nammuxMovementsBlock(rows: NammuxMovementRow[], processIndex: Record<string, number> = {}): string {
  const multi = new Set(Object.values(processIndex)).size > 1;
  const lines = rows.map((r) => {
    const when = day(r.occurred_at);
    if (!when || !r.text) return null;
    const suffix = multi && processIndex[r.opportunity_id] ? ` (processo ${processIndex[r.opportunity_id]})` : "";
    return `- ${when}: ${r.text}${suffix}`;
  }).filter(Boolean);
  if (!lines.length) return "";
  return `
## ÚLTIMAS MOVIMENTAÇÕES DO PROCESSO (o que aconteceu no tribunal)
${lines.join("\n")}
Explique com estas palavras, que já estão em linguagem simples. Não interprete além do que está escrito e não preveja resultado nem prazo. Se o cliente perguntar por algo que não está na lista, diga que não há novidade registrada.
`;
}

// deno-lint-ignore no-explicit-any
export async function loadNammuxMovements(supabase: any, organizationId: string, opportunityIds: string[]): Promise<NammuxMovementRow[]> {
  if (!opportunityIds.length) return [];
  const { data, error } = await supabase.from("nammux_process_movements")
    .select("opportunity_id, occurred_at, text")
    .eq("organization_id", organizationId)
    .in("opportunity_id", opportunityIds)
    .order("occurred_at", { ascending: false })
    .limit(5);
  if (error) {
    console.warn("[nammux-process-context] não leu as movimentações", error.code ?? "sem_codigo");
    return [];
  }
  return (data ?? []) as NammuxMovementRow[];
}

// ---------- Contexto completo do agente de atendimento ----------

export const NAMMUX_AGENT_AGENDA_FLAG = "nammux_agent_agenda";
export const NAMMUX_AGENT_FINANCE_FLAG = "nammux_agent_finance";
export const NAMMUX_AGENT_MOVEMENTS_FLAG = "nammux_agent_movements";

/**
 * Só o agente de atendimento recebe dado do Nammux. Qualquer outro tipo
 * (inclusive o comercial, 'sdr') não chama o carregador e recebe "".
 */
export async function nammuxContextForAgent(agentType: unknown, load: () => Promise<string>): Promise<string> {
  return agentType === "support" ? await load() : "";
}

/**
 * Tudo o que o agente de atendimento sabe do processo. Cada bloco novo só
 * entra com a flag da organização ligada; sem flag nenhuma, o resultado é o
 * bloco de processos de sempre.
 */
export async function nammuxSupportContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  contactId: string,
  isEnabled: (flag: string) => Promise<boolean>,
  now = new Date(),
): Promise<string> {
  const { data: opps } = await supabase.from("opportunities").select("id")
    .eq("organization_id", organizationId).eq("contact_id", contactId).is("deleted_at", null).limit(20);
  const opportunityIds = (opps ?? []).map((o: { id: string }) => o.id);
  if (!opportunityIds.length) return "";

  const { data, error } = await supabase.from("nammux_process_snapshots")
    .select("opportunity_id, cnj, process_title, phase, stage_name, status_name, status_changed_at, responsible_name, distributed_at, source_updated_at, last_synced_at")
    .eq("organization_id", organizationId)
    .in("opportunity_id", opportunityIds)
    .order("source_updated_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (error) {
    console.warn("[nammux-process-context] não leu os processos", error.message);
    return "";
  }
  const processes = (data ?? []) as (NammuxProcessRow & { opportunity_id: string })[];
  if (!processes.length) return "";

  const processIndex: Record<string, number> = {};
  processes.forEach((p, i) => { processIndex[p.opportunity_id] = i + 1; });
  const shownOpportunityIds = processes.map((p) => p.opportunity_id);

  const covered: NammuxCovered = {};
  let extra = "";
  if (await isEnabled(NAMMUX_AGENT_AGENDA_FLAG)) {
    covered.agenda = true;
    extra += nammuxAgendaBlock(await loadNammuxAgenda(supabase, organizationId, shownOpportunityIds, now), processIndex);
  }
  if (await isEnabled(NAMMUX_AGENT_FINANCE_FLAG)) {
    const finance = nammuxFinanceBlock(await loadNammuxFinance(supabase, organizationId, shownOpportunityIds), processIndex);
    // Sem acordo nem repasse não há bloco, e valor/pagamento continua no aviso de "não invente".
    if (finance) {
      covered.finance = true;
      extra += finance;
    }
  }
  if (await isEnabled(NAMMUX_AGENT_MOVEMENTS_FLAG)) {
    // Sem movimentação registrada o bloco fica vazio, mas o assunto está coberto:
    // o agente não deve mandar o cliente à equipe por falta de novidade.
    covered.movements = true;
    const movements = nammuxMovementsBlock(await loadNammuxMovements(supabase, organizationId, shownOpportunityIds), processIndex);
    extra += movements || `
## ÚLTIMAS MOVIMENTAÇÕES DO PROCESSO (o que aconteceu no tribunal)
Não há movimentação relevante registrada até agora. Se o cliente perguntar por novidade, diga que não há novidade registrada e que ele será avisado quando houver.
`;
  }
  return nammuxProcessBlock(processes, covered) + extra;
}

