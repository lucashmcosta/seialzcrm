/**
 * Catálogo de fatos do caso trabalhista. Um caso = um contrato com um empregador.
 *
 * Cada fato tem a pergunta para o lead, por que importa,
 * quando se aplica e a premissa usada enquanto não for confirmado. O motor nunca assume
 * em silêncio: toda premissa usada volta na saída, e todo fato aplicável e não perguntado
 * vira pergunta pendente.
 */
import { nightMinutesPerDay, parseTime } from './jornada';
import { NOTICE_LABEL, TERMINATION_LABEL, defaultNotice, type NoticeKind, type Termination } from './prescription';

export type FactKind = 'money' | 'number' | 'int' | 'date' | 'time' | 'bool' | 'enum' | 'text';
export type FactStatus = 'confirmado' | 'nao_sabe';
export type FactSource = 'lead' | 'time' | 'documento';

export interface FactEntry {
  value?: unknown;
  /** Ausente = confirmado se houver valor. `nao_sabe` = perguntado, o lead não sabe (usa premissa e não pergunta de novo). */
  status?: FactStatus;
  source?: FactSource;
}

export type FactGroup = 'contrato' | 'jornada' | 'adicionais' | 'rescisao';

export const FACT_GROUP_LABEL: Record<FactGroup, string> = {
  contrato: 'Contrato',
  jornada: 'Jornada real',
  adicionais: 'Condições de trabalho',
  rescisao: 'Saída, rescisão e FGTS',
};

export type InsalubrityAnswer = 'nao' | 'sim_sem_grau' | '10' | '20' | '40';
export type SeverancePaid = 'total' | 'parcial' | 'nao';
export type FgtsDeposited = 'sim' | 'parcial' | 'nao';

/** Valor confirmado de outro fato (undefined se não confirmado). Usado em `relevant` e `premise`. */
export type Peek = (key: FactKey) => unknown;

export interface FactDef {
  key: FactKey;
  group: FactGroup;
  kind: FactKind;
  label: string;
  /** Pergunta como se faz ao lead. */
  question: string;
  /** Para o time: o que essa resposta muda. */
  why: string;
  options?: { value: string; label: string }[];
  /** Sem esse fato não dá para estimar o caso. */
  required?: (peek: Peek) => boolean;
  /** Se o fato se aplica a este caso. Ausente = sempre. */
  relevant?: (peek: Peek) => boolean;
  /** Valor usado enquanto não for confirmado. Ausente = sem premissa (o pedido que depende dele fica pendente). */
  premise?: (peek: Peek) => { value: unknown; label: string };
  /** 3 = muda muito o valor ou a elegibilidade; 1 = ajuste fino. Ordena as perguntas. */
  impact: 1 | 2 | 3;
}

const left = (p: Peek) => p('ainda_trabalha') === false;
const indirect = (p: Peek) => p('ainda_trabalha') === true && p('quer_rescisao_indireta') === true;
const ended = (p: Peek) => left(p) || indirect(p);
const termination = (p: Peek): Termination | undefined =>
  indirect(p) ? 'rescisao_indireta' : (p('desligamento') as Termination | undefined);

const opts = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

export const FACTS: FactDef[] = [
  // Contrato
  {
    key: 'empresa', group: 'contrato', kind: 'text', impact: 1, label: 'Empresa',
    question: 'Qual o nome da empresa em que você trabalhou?',
    why: 'Identifica o contrato. Cada empresa é um caso separado, com prazo próprio.',
  },
  {
    key: 'salario', group: 'contrato', kind: 'money', impact: 3, label: 'Salário na carteira (R$)',
    question: 'Qual era o seu salário registrado na carteira?',
    why: 'Base de todos os cálculos.', required: () => true,
  },
  {
    key: 'remuneracao_variavel', group: 'contrato', kind: 'money', impact: 2, label: 'Comissões / por fora (R$/mês)',
    question: 'Recebia comissão, prêmio ou algum valor por fora? Quanto por mês, em média?',
    why: 'Valor habitual integra a base da hora extra e dos reflexos.',
    premise: () => ({ value: 0, label: 'sem comissão/por fora' }),
  },
  {
    key: 'admissao', group: 'contrato', kind: 'date', impact: 3, label: 'Admissão',
    question: 'Em que data você começou a trabalhar lá?',
    why: 'Define aviso, férias, 13º e o período cobrável.', required: () => true,
  },
  {
    key: 'ainda_trabalha', group: 'contrato', kind: 'bool', impact: 3, label: 'Ainda trabalha lá?',
    question: 'Você ainda trabalha nessa empresa?',
    why: 'Quem saiu tem 2 anos para entrar com a ação.', required: () => true,
  },
  {
    key: 'saida', group: 'contrato', kind: 'date', impact: 3, label: 'Saída',
    question: 'Qual foi o seu último dia de trabalho?',
    why: 'Conta o prazo de 2 anos e o fim do período cobrável.', relevant: left, required: left,
  },
  {
    key: 'desligamento', group: 'contrato', kind: 'enum', impact: 3, label: 'Como saiu',
    question: 'Como foi a saída: foi mandado embora, pediu demissão, justa causa ou fez acordo?',
    why: 'Muda aviso, multa do FGTS, 13º e férias proporcionais.',
    options: opts(TERMINATION_LABEL).filter((o) => o.value !== 'rescisao_indireta'),
    relevant: left, required: left,
  },
  {
    key: 'quer_rescisao_indireta', group: 'contrato', kind: 'bool', impact: 2, label: 'Quer rescisão indireta?',
    question: 'Você quer sair da empresa pela Justiça (rescisão indireta), recebendo como se fosse mandado embora?',
    why: 'Se sim, entram aviso, multa de 40% do FGTS e rescisórias.',
    relevant: (p) => p('ainda_trabalha') === true,
    premise: () => ({ value: false, label: 'continua no emprego' }),
  },
  {
    key: 'aviso', group: 'contrato', kind: 'enum', impact: 3, label: 'Aviso prévio',
    question: 'Você cumpriu o aviso trabalhando ou foi dispensado de cumprir?',
    why: 'Aviso indenizado conta no prazo de 2 anos e entra na rescisão.',
    options: opts(NOTICE_LABEL),
    relevant: (p) => left(p) && p('desligamento') !== 'justa_causa',
    premise: (p) => {
      const t = termination(p);
      const v: NoticeKind = t ? defaultNotice(t) : 'indenizado';
      return { value: v, label: `aviso ${NOTICE_LABEL[v].toLowerCase()}` };
    },
  },
  {
    key: 'jornada_contratual', group: 'contrato', kind: 'number', impact: 2, label: 'Jornada na carteira (h/semana)',
    question: 'Quantas horas por semana estavam na carteira? (Normalmente 44.)',
    why: 'Define o divisor da hora e a partir de quando é hora extra.',
    premise: () => ({ value: 44, label: '44h semanais na carteira' }),
  },

  // Jornada real
  {
    key: 'entrada', group: 'jornada', kind: 'time', impact: 3, label: 'Entrada',
    question: 'Que horas você costumava chegar para trabalhar?',
    why: 'Com a saída, mostra as horas extras e o adicional noturno.',
  },
  {
    key: 'saida_expediente', group: 'jornada', kind: 'time', impact: 3, label: 'Saída do expediente',
    question: 'E que horas costumava ir embora?',
    why: 'Com a entrada, mostra as horas extras e o adicional noturno.',
  },
  {
    key: 'intervalo', group: 'jornada', kind: 'int', impact: 2, label: 'Almoço (min)',
    question: 'Quanto tempo de almoço você tirava de verdade?',
    why: 'Almoço menor que 1h gera pedido de intervalo e aumenta as horas trabalhadas.',
    premise: () => ({ value: 60, label: '1h de almoço' }),
  },
  {
    key: 'dias_semana', group: 'jornada', kind: 'number', impact: 3, label: 'Dias por semana',
    question: 'Quantos dias por semana você trabalhava?',
    why: 'Multiplica as horas extras da semana.',
  },
  {
    key: 'domingos_feriados', group: 'jornada', kind: 'number', impact: 2, label: 'Domingos/feriados por mês',
    question: 'Trabalhava domingo ou feriado sem folgar em outro dia? Quantos por mês?',
    why: 'Pagos em dobro (100%).',
    premise: () => ({ value: 0, label: 'sem domingos/feriados' }),
  },
  {
    key: 'he_pagas', group: 'jornada', kind: 'number', impact: 2, label: 'Horas extras já pagas (h/mês)',
    question: 'A empresa pagava alguma hora extra no holerite? Quantas por mês, mais ou menos?',
    why: 'É descontado do que se cobra.',
    premise: () => ({ value: 0, label: 'nenhuma hora extra paga' }),
  },
  {
    key: 'noturno_pago', group: 'jornada', kind: 'bool', impact: 1, label: 'Recebia adicional noturno?',
    question: 'No holerite vinha adicional noturno?',
    why: 'Só se cobra o adicional noturno que não era pago.',
    relevant: (p) => {
      const start = parseTime(p('entrada'));
      const end = parseTime(p('saida_expediente'));
      return start != null && end != null && nightMinutesPerDay({ start, end }) > 0;
    },
    premise: () => ({ value: false, label: 'não recebia adicional noturno' }),
  },

  // Condições
  {
    key: 'insalubridade', group: 'adicionais', kind: 'enum', impact: 2, label: 'Insalubridade',
    question: 'Trabalhava exposto a barulho alto, calor, produtos químicos, poeira ou risco biológico?',
    why: 'Adicional de 10%, 20% ou 40% do mínimo. O grau é definido por perícia.',
    options: [
      { value: 'nao', label: 'Não' },
      { value: 'sim_sem_grau', label: 'Sim, grau a definir' },
      { value: '10', label: 'Sim, grau mínimo (10%)' },
      { value: '20', label: 'Sim, grau médio (20%)' },
      { value: '40', label: 'Sim, grau máximo (40%)' },
    ],
    premise: () => ({ value: 'nao', label: 'sem insalubridade' }),
  },
  {
    key: 'insalubridade_paga', group: 'adicionais', kind: 'bool', impact: 2, label: 'Recebia insalubridade?',
    question: 'Vinha adicional de insalubridade no holerite?',
    why: 'Se não vinha, é pedido; se vinha, só entra na base da hora.',
    relevant: (p) => p('insalubridade') != null && p('insalubridade') !== 'nao',
    premise: () => ({ value: false, label: 'não recebia insalubridade' }),
  },
  {
    key: 'periculosidade', group: 'adicionais', kind: 'bool', impact: 2, label: 'Periculosidade',
    question: 'Trabalhava com inflamáveis, eletricidade, explosivos, segurança armada ou de moto?',
    why: 'Adicional de 30% do salário. Não se acumula com insalubridade.',
    premise: () => ({ value: false, label: 'sem periculosidade' }),
  },
  {
    key: 'periculosidade_paga', group: 'adicionais', kind: 'bool', impact: 2, label: 'Recebia periculosidade?',
    question: 'Vinha adicional de periculosidade no holerite?',
    why: 'Se não vinha, é pedido; se vinha, só entra na base da hora.',
    relevant: (p) => p('periculosidade') === true,
    premise: () => ({ value: false, label: 'não recebia periculosidade' }),
  },

  // Rescisão e FGTS
  {
    key: 'rescisao_recebida', group: 'rescisao', kind: 'enum', impact: 3, label: 'Recebeu a rescisão?',
    question: 'Quando saiu, você recebeu a rescisão (saldo, férias, 13º, multa do FGTS)?',
    why: 'Rescisão não paga vira pedido inteiro.',
    options: [{ value: 'total', label: 'Recebeu tudo' }, { value: 'parcial', label: 'Recebeu uma parte' }, { value: 'nao', label: 'Não recebeu' }],
    relevant: left,
    premise: () => ({ value: 'total', label: 'recebeu a rescisão toda' }),
  },
  {
    key: 'valor_recebido', group: 'rescisao', kind: 'money', impact: 2, label: 'Quanto recebeu (R$)',
    question: 'Quanto você recebeu na rescisão, mais ou menos?',
    why: 'É descontado das verbas devidas.',
    relevant: (p) => left(p) && p('rescisao_recebida') === 'parcial',
  },
  {
    key: 'rescisao_no_prazo', group: 'rescisao', kind: 'bool', impact: 1, label: 'Pagou em até 10 dias?',
    question: 'A rescisão foi paga em até 10 dias depois da saída?',
    why: 'Atraso gera multa de 1 salário (art. 477).',
    relevant: (p) => left(p) && p('rescisao_recebida') !== 'nao',
    premise: () => ({ value: true, label: 'rescisão paga no prazo' }),
  },
  {
    key: 'ferias_vencidas', group: 'rescisao', kind: 'int', impact: 2, label: 'Férias não tiradas (períodos)',
    question: 'Teve algum ano em que ficou sem tirar férias? Quantos?',
    why: 'Cada período não gozado vale 1 salário + 1/3.',
    relevant: ended,
    premise: () => ({ value: 0, label: 'tirou todas as férias' }),
  },
  {
    key: 'fgts_depositado', group: 'rescisao', kind: 'enum', impact: 2, label: 'FGTS depositado?',
    question: 'A empresa depositava o seu FGTS certinho? (Dá para ver no app do FGTS.)',
    why: 'FGTS não depositado é pedido, com multa de 40% se foi mandado embora.',
    options: [{ value: 'sim', label: 'Sim, todo mês' }, { value: 'parcial', label: 'Faltam meses' }, { value: 'nao', label: 'Não depositava' }],
    premise: () => ({ value: 'sim', label: 'FGTS depositado' }),
  },
  {
    key: 'meses_sem_fgts', group: 'rescisao', kind: 'number', impact: 2, label: 'Meses sem FGTS',
    question: 'Quantos meses ficaram sem depósito do FGTS?',
    why: 'Base do pedido de FGTS.',
    relevant: (p) => p('fgts_depositado') === 'parcial',
  },
  {
    key: 'saldo_fgts', group: 'rescisao', kind: 'money', impact: 1, label: 'Saldo do FGTS (R$)',
    question: 'Quanto tem de saldo no FGTS desse emprego? (Aparece no app do FGTS.)',
    why: 'Base da multa de 40%. Sem ele, o saldo é estimado.',
    relevant: ended,
    // O motor lê só o valor confirmado; a premissa aqui serve para mostrar o que acontece se ficar vazio.
    premise: () => ({ value: null, label: 'estimado pelo salário' }),
  },
];

export const FACT_KEYS = [
  'empresa', 'salario', 'remuneracao_variavel', 'admissao', 'ainda_trabalha', 'saida', 'desligamento',
  'quer_rescisao_indireta', 'aviso', 'jornada_contratual',
  'entrada', 'saida_expediente', 'intervalo', 'dias_semana', 'domingos_feriados', 'he_pagas', 'noturno_pago',
  'insalubridade', 'insalubridade_paga', 'periculosidade', 'periculosidade_paga',
  'rescisao_recebida', 'valor_recebido', 'rescisao_no_prazo', 'ferias_vencidas', 'fgts_depositado', 'meses_sem_fgts', 'saldo_fgts',
] as const;

export type FactKey = (typeof FACT_KEYS)[number];
export type Facts = Partial<Record<FactKey, FactEntry>>;

export const FACT_BY_KEY = new Map<FactKey, FactDef>(FACTS.map((f) => [f.key, f]));
