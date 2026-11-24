// Texto de cada aviso automático ao cliente, montado com o estado ATUAL do
// processo na hora do envio. Sem banco e sem rede, para ser testável.
//
// Cada aviso tem as variáveis numeradas ({{1}}, {{2}}…) na mesma ordem do
// modelo de WhatsApp daquele tipo: `variables` vai para o modelo quando o envio
// é por modelo, e `text` é a mesma frase já preenchida (texto livre e push).
// Mudou a ordem aqui? O modelo aprovado na Meta tem de mudar junto.
//
// Não há nome, telefone nem e-mail do cliente em nenhum texto.
import { meetingLinkText } from "./meeting-link.ts";
import { safeZone, zoneNote } from "./nammux-timezone.ts";

export type NoticeKind =
  | "event_scheduled" | "event_rescheduled" | "event_cancelled"
  | "event_reminder_7d" | "event_reminder_1d" | "event_reminder_1h" | "event_starting"
  | "interview_slot_unavailable"
  | "agreement_homologated" | "installment_paid" | "installment_overdue" | "payout_done"
  | "movement_update" | "movement_unfavorable"
  | "interview_invite" | "interview_invite_reminder" | "interview_last_call";

export interface EventState {
  event_type: string;
  status: string;
  start_at: string;
  all_day: boolean;
  timezone: string | null;
  modality: string | null;
  location: string | null;
  virtual_link: string | null;
  removed_at: string | null;
}
export interface FinanceState {
  kind: string;
  status: string | null;
  number: number | null;
  installments_count: number | null;
  effective_due_date: string | null;
  due_date: string | null;
  paid_on: string | null;
  manifestation_due_date: string | null;
  homologated_on: string | null;
  amount: number | string | null;
  reversed: boolean | null;
}
export interface MovementState { text: string }
export interface InterviewRequestState { status: string; requested_start_at: string }

export interface Rendered {
  /** Frase pronta. */
  text: string;
  /** Valores de {{1}}, {{2}}… na ordem do modelo. */
  variables: string[];
  /** Título curto para a notificação do aplicativo. */
  title: string;
  /** Modelo de WhatsApp a usar, quando não é o do próprio tipo (nammux_notice_templates.kind). */
  templateKey?: string;
  /** Botões de resposta rápida. Com a janela aberta saem como botões; no modelo já estão cadastrados. */
  buttons?: string[];
}
export type RenderResult = { ok: true; rendered: Rendered } | { ok: false; reason: string };

const EVENT_NAME: Record<string, string> = { audiencia: "audiência", pericia: "perícia", entrevista: "entrevista" };
const TZ = "America/Sao_Paulo";

function fmt(iso: string, tz: string | null, opts: Intl.DateTimeFormatOptions): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: safeZone(tz), ...opts }).format(d);
}
/** "quinta-feira, 10/12/2026" */
export function longDate(iso: string, tz: string | null): string | null {
  return fmt(iso, tz, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}
/** "10:00" */
export function clock(iso: string, tz: string | null): string | null {
  return fmt(iso, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
}
/** "05/12/2026" a partir de "2026-12-05" (sem passar por fuso). */
export function shortDate(value: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}
export function money(value: number | string | null): string | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/ /g, " ");
}

/** Como participar: link, local, ou a promessa de que o escritório informa. */
export function howToJoin(e: EventState): string {
  const link = meetingLinkText(e.virtual_link);
  if (link) return `É por vídeo, neste link: ${link}`;
  if (e.location) return `É presencial, neste local: ${e.location}`;
  if (isPhoneInterview(e)) return PHONE_INTERVIEW_JOIN;
  return "O escritório vai informar como participar.";
}

/** Entrevista sem link nem local: é por ligação, o escritório liga para o cliente. */
export function isPhoneInterview(e: EventState): boolean {
  return e.event_type === "entrevista" && !meetingLinkText(e.virtual_link) && !e.location;
}
export const PHONE_INTERVIEW_JOIN = "É por ligação: vamos te ligar nesse horário, então deixe o celular por perto.";

/** Variável de modelo não aceita quebra de linha, tabulação nem vários espaços seguidos. */
function clean(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function build(title: string, template: string, values: string[]): RenderResult {
  const variables = values.map(clean);
  if (variables.some((v) => !v)) return { ok: false, reason: "missing_data" };
  const text = template.replace(/\{\{(\d+)\}\}/g, (_m, i) => variables[Number(i) - 1] ?? "");
  return { ok: true, rendered: { title, text, variables } };
}

// Convite para marcar a entrevista (processo parado na etapa Entrevista). Sem variáveis
// numeradas: o modelo da Meta é cadastrado por organização já com o nome dela no lugar de
// {{escritorio}}. No texto livre e no push, {{escritorio}} vira o nome da organização.
export const INTERVIEW_BOOK = "Quero marcar";
export const INTERVIEW_TALK_TEAM = "Falar com a equipe";
const INTERVIEW_INVITE_TEXT =
  "Olá! Aqui é da {{escritorio}}. Para darmos andamento ao seu processo, precisamos fazer uma entrevista rápida com você, de cerca de 30 minutos, por ligação. É nela que o advogado confirma os detalhes do seu caso. Toque no botão abaixo para escolher o melhor horário.";
const INTERVIEW_INVITE_REMINDER_TEXT =
  "Ainda não conseguimos marcar a sua entrevista, e o seu processo está parado esperando por ela. Sem a entrevista, não conseguimos entrar com a ação. Leva só 30 minutos e você escolhe o horário. Toque abaixo para marcar.";
const INTERVIEW_LAST_CALL_TEXT =
  "Este é o nosso último aviso sobre a sua entrevista. Sem ela, não conseguimos seguir com o seu processo, e o caso pode ser encerrado como desistência. Nesse caso, pode haver a cobrança prevista no seu contrato. Queremos seguir com você: toque abaixo e escolha um horário ainda esta semana.";

/** Modelo (frase com {{n}}) de cada tipo. É o texto a cadastrar na Meta. */
export const NOTICE_TEMPLATES: Record<NoticeKind, string> = {
  event_scheduled: "Olá! Sua {{1}} foi marcada para {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem.",
  event_rescheduled: "Atenção: sua {{1}} mudou de data. A nova data é {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem.",
  event_cancelled: "Sua {{1}} do dia {{2}} foi cancelada. Assim que houver nova data, avisamos você por aqui.",
  event_reminder_7d: "Lembrete: sua {{1}} é {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem.",
  event_reminder_1d: "Lembrete: sua {{1}} é amanhã, {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem.",
  event_reminder_1h: "Sua {{1}} começa em 1 hora, às {{2}}. {{3}} Se tiver algum problema, responda esta mensagem.",
  event_starting: "Sua {{1}} está começando agora. Entre o quanto antes para não perder o horário. {{2}} Se tiver algum problema para entrar, responda esta mensagem.",
  interview_slot_unavailable: "O horário que você escolheu para a entrevista ({{1}}) acabou de ser ocupado. Me diga outro horário que funcione para você e eu vejo o que está livre.",
  agreement_homologated: "Boa notícia: o juiz homologou o acordo do seu processo em {{1}}. Quando houver pagamento, avisamos você por aqui.",
  installment_paid: "A empresa pagou a parcela {{1}} do acordo. O escritório vai fazer o repasse da sua parte e avisa você.",
  installment_overdue: "A empresa não pagou a parcela {{1}} do acordo, que venceu em {{2}}. Vamos nos manifestar no processo em até 5 dias úteis, até {{3}}. Qualquer novidade, avisamos você por aqui.",
  payout_done: "O repasse de {{1}} referente ao seu processo foi feito em {{2}}. Se tiver dúvida, é só responder esta mensagem.",
  movement_update: "Novidade no seu processo: {{1}} Se tiver dúvida, é só responder esta mensagem.",
  movement_unfavorable: "Novidade no seu processo: {{1}} Se tiver dúvida, é só responder esta mensagem.",
  interview_invite: INTERVIEW_INVITE_TEXT,
  interview_invite_reminder: INTERVIEW_INVITE_REMINDER_TEXT,
  interview_last_call: INTERVIEW_LAST_CALL_TEXT,
};

/**
 * Véspera da ENTREVISTA: modelo próprio, com os botões de presença. Audiência e
 * perícia seguem no event_reminder_1d (não dá para remarcar audiência).
 */
export const INTERVIEW_REMINDER_KEY = "interview_reminder_1d";
export const PRESENCE_YES = "Vou participar";
export const PRESENCE_RESCHEDULE = "Preciso remarcar";
export const INTERVIEW_REMINDER_1D_TEMPLATE =
  "Lembrete: sua entrevista com a equipe do escritório é amanhã, {{1}}, às {{2}}. {{3}} Você vai conseguir participar?";

const HORA_A_CONFIRMAR = "horário a confirmar";

/** Entrevista por ligação começando: modelo próprio (o geral manda "entrar" no link). */
export const INTERVIEW_STARTING_KEY = "interview_starting_call";
export const INTERVIEW_STARTING_CALL_TEXT =
  "Sua entrevista é agora. Vamos te ligar nos próximos minutos: deixe o celular por perto e atenda mesmo que o número não esteja salvo. Se tiver algum problema, responda esta mensagem.";

export function renderEventNotice(kind: NoticeKind, e: EventState, expectedStartAt: string | null): RenderResult {
  const name = EVENT_NAME[e.event_type] ?? "compromisso";
  const date = longDate(e.start_at, e.timezone);
  if (!date) return { ok: false, reason: "missing_data" };
  // Hora LOCAL do compromisso; tribunal em outro fuso leva a hora de Brasília junto.
  const time = e.all_day ? HORA_A_CONFIRMAR : `${clock(e.start_at, e.timezone)} (${zoneNote(e.start_at, e.timezone)})`;

  if (kind === "event_cancelled") {
    return build("Compromisso cancelado", NOTICE_TEMPLATES.event_cancelled, [name, date]);
  }
  // Para os demais, o compromisso tem de continuar valendo, e na data a que o aviso se refere.
  if (e.removed_at || e.status !== "pendente") return { ok: false, reason: "subject_gone" };
  if (expectedStartAt && new Date(expectedStartAt).getTime() !== new Date(e.start_at).getTime()) {
    return { ok: false, reason: "subject_changed" };
  }
  const join = howToJoin(e);
  switch (kind) {
    case "event_scheduled":
      return build(`Sua ${name} foi marcada`, NOTICE_TEMPLATES.event_scheduled, [name, date, time, join]);
    case "event_rescheduled":
      return build(`Sua ${name} mudou de data`, NOTICE_TEMPLATES.event_rescheduled, [name, date, time, join]);
    case "event_reminder_7d":
      return build(`Lembrete da sua ${name}`, NOTICE_TEMPLATES.event_reminder_7d, [name, date, time, join]);
    case "event_reminder_1d": {
      if (e.event_type === "entrevista") {
        const r = build("Sua entrevista é amanhã", INTERVIEW_REMINDER_1D_TEMPLATE, [date, time, join]);
        if (!r.ok) return r;
        return { ok: true, rendered: { ...r.rendered, templateKey: INTERVIEW_REMINDER_KEY, buttons: [PRESENCE_YES, PRESENCE_RESCHEDULE] } };
      }
      return build(`Sua ${name} é amanhã`, NOTICE_TEMPLATES.event_reminder_1d, [name, date, time, join]);
    }
    case "event_reminder_1h":
      if (e.all_day) return { ok: false, reason: "subject_changed" };
      return build(`Sua ${name} começa em 1 hora`, NOTICE_TEMPLATES.event_reminder_1h, [name, time, join]);
    case "event_starting":
      if (e.all_day) return { ok: false, reason: "subject_changed" };
      if (isPhoneInterview(e)) {
        return { ok: true, rendered: { title: "Sua entrevista é agora", text: INTERVIEW_STARTING_CALL_TEXT, variables: [], templateKey: INTERVIEW_STARTING_KEY } };
      }
      return build(`Sua ${name} está iniciando`, NOTICE_TEMPLATES.event_starting, [name, join]);
    default:
      return { ok: false, reason: "kind_mismatch" };
  }
}

export function renderFinanceNotice(kind: NoticeKind, f: FinanceState): RenderResult {
  const parcela = f.number ? (f.installments_count ? `${f.number} de ${f.installments_count}` : String(f.number)) : "";
  switch (kind) {
    case "agreement_homologated":
      if (f.kind !== "agreement" || !f.homologated_on) return { ok: false, reason: "subject_changed" };
      return build("Acordo homologado", NOTICE_TEMPLATES.agreement_homologated, [shortDate(f.homologated_on) ?? ""]);
    case "installment_paid":
      // Se o pagamento foi estornado nesse meio-tempo, o aviso perdeu o sentido.
      if (f.kind !== "installment" || f.status !== "paid") return { ok: false, reason: "subject_changed" };
      return build("A empresa pagou", NOTICE_TEMPLATES.installment_paid, [parcela]);
    case "installment_overdue":
      // Se a parcela foi paga nesse meio-tempo, não se avisa atraso.
      if (f.kind !== "installment" || f.status !== "overdue") return { ok: false, reason: "subject_changed" };
      return build("Parcela não paga", NOTICE_TEMPLATES.installment_overdue, [
        parcela,
        shortDate(f.effective_due_date ?? f.due_date) ?? "",
        shortDate(f.manifestation_due_date) ?? "",
      ]);
    case "payout_done":
      if (f.kind !== "payout" || f.reversed) return { ok: false, reason: "subject_changed" };
      return build("Repasse feito", NOTICE_TEMPLATES.payout_done, [money(f.amount) ?? "", shortDate(f.paid_on) ?? ""]);
    default:
      return { ok: false, reason: "kind_mismatch" };
  }
}

export function renderMovementNotice(kind: NoticeKind, m: MovementState): RenderResult {
  if (kind !== "movement_update" && kind !== "movement_unfavorable") return { ok: false, reason: "kind_mismatch" };
  return build("Novidade no seu processo", NOTICE_TEMPLATES[kind], [m.text ?? ""]);
}

export function renderInterviewNotice(kind: NoticeKind, r: InterviewRequestState): RenderResult {
  if (kind !== "interview_slot_unavailable") return { ok: false, reason: "kind_mismatch" };
  if (r.status !== "rejected") return { ok: false, reason: "subject_changed" };
  const date = longDate(r.requested_start_at, TZ);
  const time = clock(r.requested_start_at, TZ);
  return build("Horário indisponível", NOTICE_TEMPLATES.interview_slot_unavailable, [date && time ? `${date} às ${time}` : ""]);
}

/** Convite para marcar a entrevista: só sai se o processo ainda espera a entrevista. */
export function renderInterviewOutreachNotice(kind: NoticeKind, stillWaiting: boolean, orgName?: string | null): RenderResult {
  if (kind !== "interview_invite" && kind !== "interview_invite_reminder" && kind !== "interview_last_call") {
    return { ok: false, reason: "kind_mismatch" };
  }
  if (!stillWaiting) return { ok: false, reason: "subject_changed" };
  const title = kind === "interview_last_call" ? "Último aviso: sua entrevista" : "Marque sua entrevista";
  const buttons = kind === "interview_last_call" ? [INTERVIEW_BOOK, INTERVIEW_TALK_TEAM] : [INTERVIEW_BOOK];
  const office = clean(orgName ?? "") || "equipe do seu processo";
  const text = NOTICE_TEMPLATES[kind].replace("{{escritorio}}", office);
  return { ok: true, rendered: { title, text, variables: [], buttons } };
}
