// Regras puras da Visão Geral da Seialz Intelligence (tests/intelligence-insights.test.ts).
export const OBJECTION_LABELS: Record<string, string> = {
  price: 'Preço',
  timing: 'Não é o momento',
  authority: 'Precisa consultar outra pessoa',
  trust: 'Falta de confiança',
  fit: 'Não é o perfil',
  competitor: 'Concorrência',
  no_need: 'Sem necessidade',
  documentacao_faltante: 'Documentação faltando',
  medo_de_processar_empregador: 'Medo de processar o empregador',
  desconfianca_advogado: 'Desconfiança do advogado',
  prazo_prescricional: 'Prazo prescricional',
  valor_indenizacao_baixo: 'Valor de indenização baixo',
  other: 'Outras',
};

// Ordem do funil. "unknown" fica de fora: não diz nada sobre a etapa.
export const STAGE_ORDER: Array<[string, string]> = [
  ['discovery', 'Descoberta'],
  ['qualification', 'Qualificação'],
  ['objection', 'Objeção'],
  ['negotiation', 'Negociação'],
  ['closing', 'Fechamento'],
  ['post_sale', 'Pós-venda'],
  ['abandoned', 'Abandonada'],
];

// Abaixo disto uma taxa engana: 1 de 2 viraria "50%".
export const MIN_DEALS_FOR_RATE = 5;

export function ratePercent(part: number, total: number, minTotal = 1): number | null {
  if (!total || total < minTotal) return null;
  return Math.round((part / total) * 100);
}

export type StageRow = { stage: string; messages: number; signals: number };

export function stageRows(rows: StageRow[]) {
  return STAGE_ORDER.flatMap(([stage, label]) => {
    const row = rows.find((r) => r.stage === stage);
    if (!row || row.messages === 0) return [];
    return [{ stage, label, messages: row.messages, signals: row.signals, percent: ratePercent(row.signals, row.messages) ?? 0 }];
  });
}
