// Como a aba Nammux da oportunidade apresenta o processo: rótulos em português
// de quem atende o cliente, datas no fuso do compromisso e a escolha do que é
// "próximo". Lógica pura, sem acesso a dados — testada em nammuxProcessView.test.ts.
import { splitMeetingLink } from "./meetingLink";

export type CompromissoRow = {
  external_event_id: string;
  event_type: string;
  subtype: string | null;
  status: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  timezone: string | null;
  modality: string | null;
  location: string | null;
  virtual_link: string | null;
  removed_at: string | null;
};

/** Item da linha do tempo do Nammux, já em linguagem simples (mesmo catálogo do app). */
export type LinhaDoTempoItem = {
  at: string;
  title: string;
  description: string | null;
  /** Decisão sensível: o escritório explica ao cliente. */
  attention: boolean;
};

const FUSO_PADRAO = "America/Sao_Paulo";

const FASES: Record<string, string> = {
  PRE_JUDICIAL: "Pré-judicial",
  JUDICIAL: "Judicial",
  EXECUCAO: "Execução",
};

const TIPOS: Record<string, string> = {
  audiencia: "Audiência",
  pericia: "Perícia",
  entrevista: "Entrevista",
};

const MODALIDADES: Record<string, string> = {
  virtual: "Virtual",
  presencial: "Presencial",
  hibrida: "Híbrida",
  hibrido: "Híbrida",
  telepresencial: "Virtual",
};

export function faseLabel(phase: string | null | undefined): string | null {
  if (!phase) return null;
  return FASES[phase.toUpperCase()] ?? phase;
}

/** "Judicial · Conhecimento · Ativo", sem repetir pedaço igual. */
export function ondeEsta(
  phase: string | null | undefined,
  stageName: string | null | undefined,
  statusName: string | null | undefined,
): string {
  const partes: string[] = [];
  for (const p of [faseLabel(phase), stageName?.trim(), statusName?.trim()]) {
    if (p && !partes.some((x) => x.toLowerCase() === p.toLowerCase())) partes.push(p);
  }
  return partes.join(" · ") || "Sem informação";
}

export function tipoCompromisso(eventType: string, subtype: string | null | undefined): string {
  const base = TIPOS[eventType] ?? "Compromisso";
  const sub = subtype?.trim();
  return sub && sub.toLowerCase() !== base.toLowerCase() ? `${base} · ${sub}` : base;
}

export function modalidadeLabel(modality: string | null | undefined): string | null {
  if (!modality) return null;
  return MODALIDADES[modality.toLowerCase()] ?? null;
}

function fusoValido(tz: string | null | undefined): string {
  if (!tz) return FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return tz;
  } catch {
    return FUSO_PADRAO;
  }
}

/** Dia do calendário (AAAA-MM-DD) de um instante num fuso. */
function diaNoFuso(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function diasEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** "qui., 10/12/2026 às 10:00" no fuso do compromisso; dia inteiro sai sem hora. */
export function quandoCompromisso(row: Pick<CompromissoRow, "start_at" | "all_day" | "timezone">): string {
  const tz = fusoValido(row.timezone);
  // Dia inteiro vem como meia-noite UTC do dia: lido em UTC para não voltar um dia.
  const d = new Date(row.start_at);
  if (Number.isNaN(d.getTime())) return "Data não informada";
  const fusoDoDia = row.all_day ? "UTC" : tz;
  const dia = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoDoDia, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
  if (row.all_day) return `${dia} (dia inteiro)`;
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${dia} às ${hora}`;
}

const ROTULOS_FUSO: Record<string, string> = {
  "America/Sao_Paulo": "horário de Brasília",
  "America/Manaus": "horário de Manaus",
  "America/Cuiaba": "horário de Cuiabá",
  "America/Campo_Grande": "horário de Campo Grande",
  "America/Porto_Velho": "horário de Porto Velho",
  "America/Rio_Branco": "horário de Rio Branco",
};

/**
 * Tribunal fora do horário de Brasília: a hora mostrada é a LOCAL (a que vale
 * para o cliente). Devolve o rótulo do fuso e a mesma hora no relógio de
 * Brasília; null quando as duas são iguais ou o compromisso é de dia inteiro.
 */
export function horaEmOutroFuso(
  row: Pick<CompromissoRow, "start_at" | "all_day" | "timezone">,
): { rotulo: string; brasilia: string } | null {
  if (row.all_day) return null;
  const tz = fusoValido(row.timezone);
  if (tz === FUSO_PADRAO) return null;
  const d = new Date(row.start_at);
  if (Number.isNaN(d.getTime())) return null;
  const hm = (fuso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const brasilia = hm(FUSO_PADRAO);
  if (hm(tz) === brasilia) return null;
  return { rotulo: ROTULOS_FUSO[tz] ?? "horário local", brasilia };
}

/** "hoje", "amanhã", "em 12 dias" — contado em dias de calendário no fuso do compromisso. */
export function faltam(row: Pick<CompromissoRow, "start_at" | "all_day" | "timezone">, agora: Date): string {
  const tz = fusoValido(row.timezone);
  const d = new Date(row.start_at);
  if (Number.isNaN(d.getTime())) return "";
  const dias = diasEntre(diaNoFuso(agora, tz), diaNoFuso(d, row.all_day ? "UTC" : tz));
  if (dias < 0) return "";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

/**
 * Compromissos que ainda vão acontecer: pendentes, não removidos, de hoje em
 * diante (um compromisso de hoje cedo continua aparecendo até o dia acabar).
 */
export function proximosCompromissos<T extends CompromissoRow>(rows: T[], agora: Date): T[] {
  return rows
    .filter((r) => {
      if (r.status !== "pendente" || r.removed_at) return false;
      const d = new Date(r.start_at);
      if (Number.isNaN(d.getTime())) return false;
      const tz = fusoValido(r.timezone);
      return diasEntre(diaNoFuso(agora, tz), diaNoFuso(d, r.all_day ? "UTC" : tz)) >= 0;
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

/** Só devolve o link se for http(s): o campo vem de outro sistema. */
export function linkSeguro(url: string | null | undefined): string | null {
  return splitMeetingLink(url).url;
}

/** Data simples (dd/mm/aaaa) de um campo que é só data, sem voltar um dia pelo fuso. */
export function dataSimples(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
}
