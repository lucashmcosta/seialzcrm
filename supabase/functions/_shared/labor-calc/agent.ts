/**
 * A calculadora da Central Trabalhista como ferramenta do agente de IA.
 *
 * É o mesmo motor do widget da equipe: o agente passa os fatos que o cliente contou, e a
 * mensagem da rescisão que sai para o cliente é a mesma que a equipe copia no widget.
 */
import { brl } from './money.ts';
import { caseSummaryText, calcularCaso, type CaseResult } from './engine.ts';
import { FACTS, FACT_KEYS, type FactKey, type Facts } from './facts.ts';
import { severanceClientText } from './clientText.ts';

export const LABOR_CALC_TOOL = 'calculate_labor_case';
/** O widget que liga a calculadora na org. A chave antiga ficou para não perder o que já estava ligado. */
export const LABOR_CALC_WIDGET_KEY = 'overtime_calculator';
/** Começo da mensagem do cálculo, para saber se ela já foi mandada nesta conversa. */
export const LABOR_CALC_CLIENT_HEADER = '*Cálculo da sua rescisão*';

const FORMAT_HINT: Partial<Record<string, string>> = {
  date: ' Formato AAAA-MM-DD.',
  time: ' Formato HH:MM (24h).',
  money: ' Em reais, só o número.',
};

/** Esquema de entrada da ferramenta, montado a partir do catálogo de fatos do widget. */
export function laborCaseToolParameters() {
  const properties: Record<string, unknown> = {};
  for (const f of FACTS) {
    const type = f.kind === 'money' || f.kind === 'number' || f.kind === 'int' ? 'number' : f.kind === 'bool' ? 'boolean' : 'string';
    const options = f.options ? ` Valores: ${f.options.map((o) => `${o.value} (${o.label})`).join('; ')}.` : '';
    properties[f.key] = {
      type,
      ...(f.options ? { enum: f.options.map((o) => o.value) } : {}),
      description: `${f.label}. Pergunta: ${f.question}${FORMAT_HINT[f.kind] ?? ''}${options}`,
    };
  }
  return {
    type: 'object',
    properties: {
      fatos: {
        type: 'object',
        properties,
        description: 'Tudo o que o cliente já contou sobre UM contrato (uma empresa). Deixe de fora o que ele não disse.',
      },
      nao_sabe: {
        type: 'array',
        items: { type: 'string', enum: [...FACT_KEYS] },
        description: 'Fatos que você perguntou e o cliente disse que não sabe.',
      },
    },
    required: ['fatos'],
  };
}

export interface LaborCalcInput {
  fatos?: Record<string, unknown> | null;
  nao_sabe?: unknown;
}

export interface LaborCalcOutcome {
  /** Mensagem da rescisão para o cliente, igual à do widget. null = não mandar agora. */
  clientText: string | null;
  /** Resumo do caso para a equipe (nota interna), igual ao "copiar resumo" do widget. */
  teamNote: string | null;
  /** O que volta para o modelo. */
  modelMessage: string;
  result: CaseResult;
}

export function buildLaborFacts(input: LaborCalcInput): Facts {
  const facts: Facts = {};
  const raw = input.fatos && typeof input.fatos === 'object' ? input.fatos : {};
  const dontKnow = Array.isArray(input.nao_sabe) ? input.nao_sabe.map(String) : [];
  for (const key of FACT_KEYS) {
    if (dontKnow.includes(key)) facts[key] = { status: 'nao_sabe', source: 'lead' };
    else if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') facts[key] = { value: raw[key], source: 'lead' };
  }
  return facts;
}

const ask = (questions: string[]) => questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

export function runLaborCaseForAgent(input: LaborCalcInput, filingDate?: string): LaborCalcOutcome {
  const facts = buildLaborFacts(input);
  const result = calcularCaso({ facts, settings: filingDate ? { filingDate } : {} });
  const empresa = typeof facts.empresa?.value === 'string' ? facts.empresa.value : undefined;
  const sim = result.severance;
  const teamNote = sim || result.total > 0 ? caseSummaryText(result, empresa) : null;

  if (result.eligibility.status === 'prescrito') {
    return {
      clientText: null, teamNote, result,
      modelMessage: `${result.eligibility.message} Não mande cálculo. Explique com cuidado que o prazo para esse contrato passou, e siga as suas instruções para caso fora do prazo.`,
    };
  }

  // Antes de mandar valor ao cliente: tudo o que é obrigatório, e o que pesa muito na rescisão.
  const heavy = new Set<FactKey>(sim?.premises ?? []);
  const missing = result.pending.filter((q) => q.required || (q.impact === 3 && heavy.has(q.key)));
  if (!sim || missing.length) {
    const questions = (missing.length ? missing : result.pending.filter((q) => q.impact === 3)).map((q) => q.question);
    return {
      clientText: null, teamNote, result,
      modelMessage: questions.length
        ? `Ainda não dá para mandar o cálculo da rescisão. Falta perguntar (uma coisa por vez, na ordem):\n${ask(questions)}\nDepois chame a ferramenta de novo com tudo.`
        : 'Não há cálculo de rescisão para este caso (o contrato não terminou). Não fale em valores.',
    };
  }

  const received = typeof facts.valor_recebido?.value === 'number' ? ` O cliente disse que recebeu ${brl(facts.valor_recebido.value)}.` : '';
  const better = result.pending.slice(0, 3).map((q) => q.question);
  return {
    clientText: severanceClientText(sim, empresa),
    teamNote, result,
    modelMessage: [
      `O cálculo da rescisão vai para o cliente logo depois do seu texto, igual ao que a equipe manda. Total que ele deveria ter recebido: ${brl(sim.total)}.${received}`,
      'Escreva no máximo uma frase curta antes do cálculo. Não repita os valores da lista e não prometa resultado: é uma estimativa, a equipe confirma.',
      better.length ? `Perguntas que ainda melhoram o cálculo, se fizer sentido na conversa:\n${ask(better)}` : '',
    ].filter(Boolean).join('\n'),
  };
}
