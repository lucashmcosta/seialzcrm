// Perguntas do assistente do vendedor (textos validados — versão do consultor: SEM % e SEM R$ calculados).
// As condições (cond) e padrões (padrao) fazem parte das REGRAS: mudar aqui = nova versão do motor.
import type { Calibracao, Entrada, RespostasTese, TeseId } from './tipos';
import { CATALOGO as catalogo } from './catalogo';

export interface CtxPergunta { saida: Entrada['saida']; local: Entrada['local']; meses: number; testemunha: boolean; teses: TeseId[] }
type Opcao = [valor: string, rotulo: string];
export interface Pergunta {
  id: string;
  tipo: 'chip' | 'select' | 'multi' | 'num';
  rotulo: string | ((r: RespostasTese, c: CtxPergunta) => string);
  opcoes?: Opcao[] | ((r: RespostasTese, c: CtxPergunta, cal: Calibracao) => Opcao[]);
  /** valor inicial mostrado e usado no cálculo quando o vendedor não mexe */
  padrao?: string | number | string[] | ((c: CtxPergunta) => string);
  /** a pergunta só aparece (e só vale) quando a condição é verdadeira */
  cond?: (r: RespostasTese, c: CtxPergunta) => boolean;
}

const defPonto = (c: CtxPergunta, p: string) => (c.local === 'externo' ? 'nao_havia' : p);
const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const CAT = catalogo as any;

// ------------------------------------------------ passos 1 e 2: dados do contrato e saída (vão para os campos do topo da Entrada)
export const SAIDAS: Opcao[] = [
  ['sem_justa_causa', 'Dispensa sem justa causa'], ['rescisao_indireta', 'Rescisão indireta'],
  ['pedido_demissao', 'Pedido de demissão (vício)'], ['sem_registro', 'Sem registro (vínculo)'], ['justa_causa', 'Justa causa (reverter)'],
];
const SIM_NAO: Opcao[] = [['nao', 'Não'], ['sim', 'Sim']]; // 'sim' → true, 'nao' → false na Entrada

export interface PerguntaTopo {
  campo: keyof Entrada; tipo: 'num' | 'select' | 'chip'; rotulo: string; dica?: string; opcoes?: Opcao[];
  padrao?: string | number; nota?: string;
  /** a pergunta só aparece quando a saída escolhida pede (as respostas escondidas não são enviadas) */
  cond?: (e: Partial<Entrada>) => boolean;
  /** devolve a mensagem de erro (mesma do protótipo) ou '' quando está ok */
  validar?: (v: number) => string;
}
export const PASSO_DADOS: PerguntaTopo[] = [
  { campo: 'salario', tipo: 'num', rotulo: 'Salário mensal', dica: 'R$', validar: v => (v > 0 ? '' : 'Informe o salário.') },
  { campo: 'meses', tipo: 'num', rotulo: 'Meses de vínculo', validar: v => (v > 0 ? '' : 'Informe os meses de vínculo.') },
  { campo: 'funcionarios', tipo: 'num', rotulo: 'Nº de funcionários', dica: 'na empresa', validar: v => (v > 0 ? '' : 'Informe o número de funcionários.') },
  { campo: 'diasSemana', tipo: 'num', rotulo: 'Dias trabalhados por semana', padrao: 5, validar: v => (v >= 1 && v <= 7 ? '' : 'Dias por semana: de 1 a 7.') },
];
export const PASSO_SAIDA: PerguntaTopo[] = [
  { campo: 'saida', tipo: 'select', rotulo: 'Como saiu', opcoes: SAIDAS, padrao: 'sem_justa_causa' },
  { campo: 'riFalta', tipo: 'chip', rotulo: 'Rescisão indireta: qual a principal falta da empresa?', dica: 'o cliente prova', padrao: 'doc',
    opcoes: [['doc', 'Atraso de salário / FGTS não depositado'], ['verbas', 'Não pagava extras/adicionais'], ['conduta', 'Assédio, ofensas, rigor excessivo']],
    cond: e => e.saida === 'rescisao_indireta' },
  { campo: 'vinculoEmpresaAdmite', tipo: 'chip', rotulo: 'Sem registro: a empresa admite que ele trabalhou lá?', dica: 'mesmo dizendo que era autônomo/PJ',
    opcoes: [['nao', 'Não, nega'], ['sim', 'Sim, admite']], padrao: 'nao', cond: e => e.saida === 'sem_registro',
    nota: 'Sem registro: marcamos sozinho FGTS (todo o período), verbas rescisórias (13º e férias de todo o período) e dano moral por informalidade. Desmarque o que não se aplicar.' },
  { campo: 'vinculoTemProva', tipo: 'chip', rotulo: 'Tem prova do trabalho?', dica: 'PIX, mensagens, crachá, fotos', opcoes: SIM_NAO, padrao: 'nao',
    cond: e => e.saida === 'sem_registro' },
  { campo: 'jcEmpresaTemProva', tipo: 'chip', rotulo: 'Justa causa: a empresa tem advertências, suspensões ou prova da falta?', dica: 'o ônus é dela',
    opcoes: SIM_NAO, padrao: 'nao', cond: e => e.saida === 'justa_causa' },
  { campo: 'local', tipo: 'chip', rotulo: 'Trabalho', dica: 'afeta jornada', opcoes: [['interno', 'Interno'], ['externo', 'Externo']], padrao: 'interno' },
  { campo: 'testemunha', tipo: 'chip', rotulo: 'Testemunha do período?', dica: 'reforça as teses', opcoes: SIM_NAO, padrao: 'nao' },
];
/** Sem registro: ao escolher essa saída, estas teses entram marcadas (o vendedor pode desmarcar) e "informalidade" entra no dano moral. */
export const AUTO_SEM_REGISTRO: TeseId[] = ['verbas_rescisorias', 'fgts', 'dano_moral'];
export const AUTO_SEM_REGISTRO_SITUACAO = 'informalidade';

/** Mensagens que travam o "Próximo" na tela da tese (avisos bloqueantes do motor). */
export const MENSAGEM_FALTA: Record<string, string> = {
  'MARQUE OS AGENTES': 'Marque os agentes de exposição.',
  'MARQUE AS SITUAÇÕES': 'Marque pelo menos uma situação.',
  'INFORME A DIFERENÇA': 'Informe quanto o colega ganha a mais por mês.',
};
/** Títulos de cada passo do assistente. */
export const TITULOS_PASSO = {
  dados: ['Dados do contrato', 'Informe o que o cliente contou sobre o emprego'],
  saida: ['Como terminou o contrato', 'Saída, tipo de trabalho e testemunha'],
  teses: ['Quais direitos o caso tem?', 'Marque todas as teses que se aplicam'],
  tese: ['(nome da tese)', 'Responda com o que o cliente informou'],
  revisao: ['Confira antes de finalizar', 'Depois de finalizar não dá para alterar'],
} as const;
/** Nome de cada tese como aparece para o vendedor. */
export const NOME_TESE: Record<TeseId, string> = Object.fromEntries(
  Object.entries(CAT).map(([k, v]: [string, any]) => [k, v.nome])) as any;

// ------------------------------------------------ perguntas por tese
export const PERGUNTAS: Record<TeseId, Pergunta[]> = {
  horas_extras: [
    { id: 'he_ponto', tipo: 'select', rotulo: 'Como marcava o ponto?', padrao: c => defPonto(c, 'relogio'),
      opcoes: [['relogio', 'Relógio/cartão'], ['app', 'Aplicativo'], ['manual', 'Folha manual'], ['nao_havia', 'Não havia']] },
    { id: 'he_real', tipo: 'chip', rotulo: 'Ponto mostrava horário real?', opcoes: [['sim', 'Sim'], ['nao', 'Não/fixo']], padrao: 'sim',
      cond: (r, c) => (r.he_ponto ?? defPonto(c, 'relogio')) !== 'nao_havia' },
    { id: 'he_pagou', tipo: 'chip', rotulo: 'A empresa pagou as extras que o ponto registra?', opcoes: [['nao', 'Não'], ['parte', 'Parte'], ['sim', 'Sim, todas']], padrao: 'nao',
      cond: (r, c) => r.he_real !== 'nao' && (r.he_ponto ?? defPonto(c, 'relogio')) !== 'nao_havia' },
    { id: 'he_dia', tipo: 'num', rotulo: 'Horas extra/dia', padrao: 2 },
  ],
  intrajornada: [
    { id: 'intra_min', tipo: 'num', rotulo: 'Minutos de almoço reais', padrao: 30 },
    { id: 'intra_registro', tipo: 'select', rotulo: 'O que o ponto mostrava do intervalo?', padrao: 'nao',
      opcoes: [['nao', 'Não registrava / sem ponto'], ['pre', 'Marcava 1h, mas na prática não tirava (pré-assinalado)'], ['sim_suprimido', 'Marcava menos de 1h (o próprio ponto mostra)']] },
  ],
  noturno: [
    { id: 'not_h', tipo: 'num', rotulo: 'Horas após 22h/dia', padrao: 2 },
    { id: 'not_sit', tipo: 'select', rotulo: 'Como era o adicional noturno?', padrao: 'nao_pagou',
      opcoes: [['nao_pagou', 'Não pagava'], ['a_menor', 'Pagava a menor / sem hora reduzida'], ['pagou', 'Pagava certo']] },
    { id: 'not_ponto', tipo: 'select', rotulo: 'O ponto registrava o horário depois das 22h?', padrao: c => defPonto(c, 'real'),
      opcoes: [['real', 'Sim, marcava o horário real'], ['fraude', 'Não — marcava saída antes / horário fixo'], ['nao_havia', 'Não havia controle de ponto']],
      cond: r => (r.not_sit || 'nao_pagou') === 'nao_pagou' },
  ],
  insalubridade: [
    { id: 'ins_agentes', tipo: 'multi', rotulo: 'Agentes (marque todos — são agravantes)', padrao: [],
      opcoes: () => Object.entries(CAT.insalubridade.agentes).map(([k, a]: [string, any]) => [k, a.label] as Opcao) },
    { id: 'ins_ruido_nivel', tipo: 'chip', rotulo: 'Como era o barulho?', padrao: 'alto',
      opcoes: [['alto', 'Alto o dia todo (precisava gritar pra conversar)'], ['moderado', 'Moderado / de vez em quando']],
      cond: r => lista(r.ins_agentes).includes('ruido') },
    { id: 'ins_poeira_tipo', tipo: 'chip', rotulo: 'Que tipo de poeira?', padrao: 'mineral',
      opcoes: [['mineral', 'Mineral (sílica, cimento, amianto, carvão)'], ['comum', 'Comum (madeira, farinha, terra)']],
      cond: r => lista(r.ins_agentes).includes('poeira') },
    { id: 'ins_recebe', tipo: 'chip', rotulo: 'Já recebe insalubridade?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao' },
    { id: 'ins_grau_recebe', tipo: 'chip', rotulo: 'Qual grau recebe hoje?', opcoes: [['i10', '10%'], ['i20', '20%'], ['i40', '40%']], padrao: 'i20',
      cond: r => r.ins_recebe === 'sim' },
    { id: 'ins_epi_ags', tipo: 'multi', rotulo: 'Recebia EPI com ficha assinada? Marque os agentes em que recebia (deixe desmarcado se não recebia)', padrao: [],
      opcoes: r => lista(r.ins_agentes).filter(a => CAT.insalubridade.agentes[a]).map(a => [a, CAT.insalubridade.agentes[a].label + ' — ' + CAT.insalubridade.agentes[a].epi] as Opcao),
      cond: r => r.ins_recebe !== 'sim' && lista(r.ins_agentes).length > 0 },
  ],
  periculosidade: [
    { id: 'per_ativs', tipo: 'multi', rotulo: 'Atividades perigosas (marque todas)', padrao: [],
      opcoes: [['eletricidade', 'Eletricidade'], ['inflamavel', 'Inflamável/GLP'], ['vigilancia', 'Vigilância'], ['moto', 'Motocicleta'], ['explosivo', 'Explosivos'], ['radiacao', 'Radiação']] },
    { id: 'per_recebe', tipo: 'chip', rotulo: 'Já recebe periculosidade?', opcoes: [['nao', 'Não'], ['sim', 'Sim, 30% certo'], ['base', 'Sim, base errada']], padrao: 'nao' },
    { id: 'per_dif_base', tipo: 'num', rotulo: 'Valor mensal fora da base de cálculo (R$)', padrao: 300, cond: r => r.per_recebe === 'base' },
  ],
  verbas_rescisorias: [
    { id: 'resc', tipo: 'chip', rotulo: 'Recebeu a rescisão?', opcoes: [['nada', 'Nada'], ['parcial', 'Parte'], ['tudo', 'Tudo']], padrao: 'nada',
      cond: (r, c) => c.saida !== 'sem_registro' },
    { id: 'prazo477', tipo: 'chip', rotulo: 'Pagou E entregou os documentos (guias) em até 10 dias?', padrao: 'sim',
      opcoes: [['sim', 'Sim, tudo em dia'], ['atrasou', 'Pagou atrasado'], ['guias', 'Pagou em dia, guias atrasaram']],
      cond: (r, c) => (r.resc || 'nada') === 'tudo' && ['sem_justa_causa', 'pedido_demissao', 'justa_causa'].includes(c.saida) },
    { id: 'sr_13ferias', tipo: 'chip', rotulo: 'Recebia 13º e férias mesmo sem registro?', opcoes: [['nao', 'Não (o normal sem registro)'], ['sim', 'Sim']], padrao: 'nao',
      cond: (r, c) => c.saida === 'sem_registro' },
    { id: 'ferias_venc', tipo: 'chip', rotulo: 'Tirou as férias dos anos completos?', padrao: 'sim',
      opcoes: [['sim', 'Sim, tirou'], ['ultimo', 'Não tirou a do último ano'], ['dois', 'Ficou 2+ anos sem tirar']],
      cond: (r, c) => c.meses >= 12 && (r.resc || 'nada') !== 'tudo' },
  ],
  fgts: [ // sem registro: nada foi depositado — não pergunta, usa o período todo
    { id: 'fgts_extrato', tipo: 'chip', rotulo: 'Extrato mostra meses sem depósito?', opcoes: [['sim', 'Sim'], ['nao', 'Não/não sabe']], padrao: 'sim',
      cond: (r, c) => c.saida !== 'sem_registro' },
    { id: 'fgts_meses', tipo: 'num', rotulo: 'Meses sem depósito', padrao: 12, cond: (r, c) => c.saida !== 'sem_registro' },
  ],
  equiparacao: [
    { id: 'eq_paradigma', tipo: 'chip', rotulo: 'Sabe o nome de um funcionário que ganha mais para a mesma função?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao' },
    { id: 'eq_dif', tipo: 'num', rotulo: 'Quanto esse colega ganha a mais por mês (R$)', padrao: 0 },
  ],
  por_fora: [
    { id: 'pf_valor', tipo: 'num', rotulo: 'Quanto recebia por fora (R$/mês)', padrao: 500 },
    { id: 'pf_forma', tipo: 'select', rotulo: 'Como recebia?', padrao: 'pix',
      opcoes: [['pix', 'PIX / transferência (o extrato prova)'], ['recibo', 'Dinheiro, com recibo ou anotação da empresa'], ['dinheiro', 'Dinheiro em espécie, sem comprovante']] },
  ],
  acidente: [
    { id: 'ac_tipo', tipo: 'chip', rotulo: 'Onde aconteceu?', opcoes: [['tipico', 'No trabalho'], ['trajeto', 'No trajeto casa–trabalho']], padrao: 'tipico' },
    { id: 'ac_grav', tipo: 'chip', rotulo: 'Gravidade', opcoes: [['leve', 'Leve (sem sequela)'], ['medio', 'Média (afastou e recuperou)'], ['grave', 'Grave (sequela permanente)']], padrao: 'leve' },
    { id: 'ac_inss', tipo: 'select', rotulo: 'Afastou pelo INSS?', padrao: 'nao',
      opcoes: [['nao', 'Não afastou / menos de 15 dias'], ['b31', 'Sim, auxílio comum (B31)'], ['b91', 'Sim, auxílio acidentário (B91)']] },
    { id: 'ac_doc', tipo: 'chip', rotulo: 'Tem CAT, atestado, laudo ou registro do atendimento?', opcoes: [['sim', 'Sim'], ['nao', 'Não']], padrao: 'sim' },
    { id: 'ac_culpa', tipo: 'multi', rotulo: 'O que se aplica? (marque tudo)', padrao: [],
      opcoes: [['epi', 'Não dava EPI'], ['treino', 'Sem treinamento'], ['maquina', 'Máquina sem proteção'], ['risco', 'Atividade de risco (moto, eletricidade, altura…)']],
      cond: r => (r.ac_tipo || 'tipico') === 'tipico' },
    { id: 'ac_transp', tipo: 'chip', rotulo: 'Ia no transporte da empresa?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao', cond: r => r.ac_tipo === 'trajeto' },
    // estabilidade no acidente típico só existe se afastou mais de 15 dias pelo INSS (Súm.378,II)
    { id: 'ac_estab', tipo: 'chip', rotulo: 'Foi desligado até 12 meses depois de voltar do INSS?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao',
      cond: r => (r.ac_inss || 'nao') !== 'nao' },
    { id: 'ac_meses_volta', tipo: 'num', rotulo: 'Quantos meses depois de voltar foi desligado?', padrao: 3,
      cond: r => (r.ac_inss || 'nao') !== 'nao' && r.ac_estab === 'sim' },
    { id: 'ac_sind', tipo: 'chip', rotulo: 'Teve assistência do sindicato no pedido de demissão?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao',
      cond: (r, c) => (r.ac_inss || 'nao') !== 'nao' && r.ac_estab === 'sim' && c.saida === 'pedido_demissao' },
  ],
  doenca: [
    { id: 'do_grav', tipo: 'chip', rotulo: 'Gravidade', opcoes: [['leve', 'Leve (sem sequela)'], ['medio', 'Média (afastou e recuperou)'], ['grave', 'Grave (sequela permanente)']], padrao: 'leve' },
    { id: 'do_inss', tipo: 'select', rotulo: 'Afastou pelo INSS?', padrao: 'nao',
      opcoes: [['nao', 'Não afastou / menos de 15 dias'], ['b31', 'Sim, auxílio comum (B31)'], ['b91', 'Sim, auxílio acidentário (B91)']] },
    { id: 'do_laudo', tipo: 'chip', rotulo: 'Tem atestado ou laudo com CID (diagnóstico)?', opcoes: [['sim', 'Sim'], ['nao', 'Não']], padrao: 'sim' },
    { id: 'do_degen', tipo: 'chip', rotulo: 'Pode ser doença da idade/degenerativa? (hérnia, artrose, bico de papagaio)', opcoes: [['nao', 'Não'], ['sim', 'Sim / talvez']], padrao: 'nao' },
    // sem afastamento, a estabilidade da doença vem do Tema 125 (nexo reconhecido depois da saída) e indeniza os 12 meses
    { id: 'do_estab', tipo: 'chip', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao',
      rotulo: r => ((r.do_inss || 'nao') === 'nao' ? 'Foi desligado já com a doença? (sem afastamento — Tema 125)' : 'Foi desligado até 12 meses depois de voltar do INSS?') },
    { id: 'do_meses_volta', tipo: 'num', rotulo: 'Quantos meses depois de voltar foi desligado?', padrao: 3,
      cond: r => (r.do_inss || 'nao') !== 'nao' && r.do_estab === 'sim' },
    { id: 'do_sind', tipo: 'chip', rotulo: 'Teve assistência do sindicato no pedido de demissão?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao',
      cond: (r, c) => r.do_estab === 'sim' && c.saida === 'pedido_demissao' },
  ],
  gestante: [
    { id: 'ge_momento', tipo: 'chip', rotulo: 'Na saída…', opcoes: [['gravida', 'Estava grávida'], ['nasceu', 'O bebê já tinha nascido']], padrao: 'gravida' },
    { id: 'ge_meses', tipo: 'num', rotulo: 'Meses de gravidez na saída', padrao: 3, cond: r => (r.ge_momento || 'gravida') === 'gravida' },
    { id: 'ge_meses_bebe', tipo: 'num', rotulo: 'Meses do bebê na saída', padrao: 1, cond: r => r.ge_momento === 'nasceu' },
    { id: 'ge_contrato', tipo: 'select', rotulo: 'Tipo de contrato', padrao: 'normal',
      opcoes: [['normal', 'Normal (prazo indeterminado)'], ['experiencia', 'Contrato de experiência (tem estabilidade — Tema 163)'], ['temporario', 'Temporária (agência, Lei 6.019) — controverso']] },
    { id: 'ge_exame', tipo: 'chip', rotulo: 'Tem exame/ultrassom que mostra a gravidez antes da saída?', opcoes: [['sim', 'Sim'], ['nao', 'Não']], padrao: 'sim',
      cond: r => (r.ge_momento || 'gravida') === 'gravida' },
    { id: 'ge_sind', tipo: 'chip', rotulo: 'Teve assistência do sindicato no pedido de demissão?', opcoes: [['nao', 'Não'], ['sim', 'Sim']], padrao: 'nao',
      cond: (r, c) => c.saida === 'pedido_demissao' },
  ],
  dano_moral: [
    { id: 'dano_sits', tipo: 'multi', rotulo: 'Situações (marque todas — cada uma é um pedido com valor próprio)', padrao: [],
      opcoes: () => Object.entries(CAT.dano_moral.situacoes).map(([k, x]: [string, any]) => [k, x.label] as Opcao) },
    { id: 'dano_provas', tipo: 'multi', padrao: [],
      rotulo: (r, c) => (c.testemunha
        ? 'Quais também têm documento? (mensagem, áudio, foto) — com testemunha todas já entram; documento reforça'
        : 'Quais têm documento? (mensagem, áudio, foto) — SEM testemunha, só entra o que tem documento'),
      opcoes: r => lista(r.dano_sits).filter(k => CAT.dano_moral.situacoes[k]).map(k => [k, CAT.dano_moral.situacoes[k].label] as Opcao),
      cond: r => lista(r.dano_sits).length > 0 },
  ],
};

/** Perguntas visíveis de uma tese, na ordem, conforme as respostas atuais. */
export const perguntasVisiveis = (t: TeseId, r: RespostasTese, c: CtxPergunta) => PERGUNTAS[t].filter(p => !p.cond || p.cond(r, c));

/** Valor que a tela mostra marcado quando o vendedor não mexe. É o mesmo que o motor usa — o widget deve ENVIAR esse valor. */
export function padraoDe(p: Pergunta, c: CtxPergunta): string | number | string[] {
  if (typeof p.padrao === 'function') return p.padrao(c);
  if (p.padrao !== undefined) return p.padrao;
  return p.tipo === 'multi' ? [] : '';
}

/**
 * Pendência que trava o "Próximo" na tela da tese (mensagem para o vendedor) — a MESMA regra dos avisos
 * bloqueantes do motor, mas sem precisar da calibração (o navegador do vendedor não recebe números).
 * O servidor confere de novo com o motor (faltaPreencher) antes de gravar.
 */
export function pendenciaDaTese(t: TeseId, r: RespostasTese = {}): string {
  const comoLista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  const numero = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  if (t === 'insalubridade' && !comoLista(r.ins_agentes).some(a => CAT.insalubridade.agentes[a])) return MENSAGEM_FALTA['MARQUE OS AGENTES'];
  if (t === 'dano_moral' && !comoLista(r.dano_sits).some(k => CAT.dano_moral.situacoes[k])) return MENSAGEM_FALTA['MARQUE AS SITUAÇÕES'];
  if (t === 'equiparacao' && !(numero(r.eq_dif) > 0)) return MENSAGEM_FALTA['INFORME A DIFERENÇA'];
  return '';
}
