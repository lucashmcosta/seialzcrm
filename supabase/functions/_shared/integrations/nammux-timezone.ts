// Fuso do compromisso que vem do Nammux.
//
// Audiência de tribunal fora do horário de Brasília (Amazonas, Roraima, Mato
// Grosso, Mato Grosso do Sul, Rondônia, Acre) acontece na hora LOCAL. O Nammux
// manda o fuso em `timezone`; aqui sai o rótulo em português e, quando a hora
// local difere da de Brasília, a hora de Brasília junto — para ninguém ler
// "09:00" e entender o relógio errado. Lógica pura.

export const BRASILIA_TZ = "America/Sao_Paulo";

const ZONE_LABEL: Record<string, string> = {
  "America/Sao_Paulo": "horário de Brasília",
  "America/Manaus": "horário de Manaus",
  "America/Cuiaba": "horário de Cuiabá",
  "America/Campo_Grande": "horário de Campo Grande",
  "America/Porto_Velho": "horário de Porto Velho",
  "America/Rio_Branco": "horário de Rio Branco",
};

/** Fuso utilizável: o informado se o ambiente o conhece, senão Brasília. */
export function safeZone(tz: string | null | undefined): string {
  if (!tz) return BRASILIA_TZ;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return tz;
  } catch {
    return BRASILIA_TZ;
  }
}

/** "horário de Cuiabá"; fuso sem nome cadastrado sai como "horário local". */
export function zoneLabel(tz: string | null | undefined): string {
  return ZONE_LABEL[safeZone(tz)] ?? "horário local";
}

function hm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/**
 * O que vai entre parênteses depois da hora local:
 * "horário de Brasília", ou "horário de Cuiabá; 10:00 no horário de Brasília"
 * quando o relógio de lá é diferente do de Brasília.
 */
export function zoneNote(iso: string, tz: string | null | undefined): string {
  const zone = safeZone(tz);
  const label = zoneLabel(zone);
  const d = new Date(iso);
  if (zone === BRASILIA_TZ || isNaN(d.getTime())) return label;
  const local = hm(d, zone);
  const brasilia = hm(d, BRASILIA_TZ);
  return local === brasilia ? label : `${label}; ${brasilia} no horário de Brasília`;
}
