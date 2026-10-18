// Motor de classificação — porta fiel do protótipo "motor_comercial_v3.html" (validado com o jurídico em 16/10/2026).
// Regra de ouro: qualquer mudança aqui muda a VERSÃO DO MOTOR e precisa passar nos casos-ouro (tests/).
import type {
  Aviso, Calibracao, CalibracaoTese, Entrada, Faixa, ResultadoCaso, ResultadoTese, RespostasTese, Selo, TeseId,
} from './tipos';
import { AVISOS_BLOQUEANTES } from './tipos';
import { CATALOGO as catalogo } from './catalogo';

export const MOTOR_VERSAO = '1.0.0';
export const FAIXAS: Faixa[] = ['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'];

// ---------------------------------------------------------------- contexto do caso
interface Ctx {
  sal: number; pf: number; m: number; func: number; sh: number; vd: number; dm: number;
  saida: Entrada['saida']; meses: number; local: Entrada['local']; test: boolean;
  e: Entrada; cal: Calibracao; ativas: Set<TeseId>;
}
const num = (v: unknown, padrao = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : padrao; };

function contexto(e: Entrada, cal: Calibracao): Ctx {
  const s = num(e.salario) || 0;
  const ativas = new Set(e.teses);
  // salário por fora entra na base das horas extras/noturno/intervalo; sem registro o salário inteiro já é "por fora"
  const pfRaw = (e.respostas.por_fora ?? {}).pf_valor ?? 500;
  const pf = ativas.has('por_fora') && e.saida !== 'sem_registro' ? (num(pfRaw) || 0) : 0;
  const meses = num(e.meses) || 0;
  return {
    sal: s, pf, m: Math.min(meses, 60), func: num(e.funcionarios) || 0,
    sh: (s + pf) / 220, vd: s / 30, dm: (num(e.diasSemana) || 5) * 4.33,
    saida: e.saida, meses, local: e.local ?? 'interno', test: !!e.testemunha, e, cal, ativas,
  };
}

// ---------------------------------------------------------------- leitura da calibração
const tc = (C: Ctx, t: TeseId) => C.cal[t] as CalibracaoTese;
const pp = (C: Ctx, t: TeseId, k: string) => {
  const v = tc(C, t).probs[k];
  if (v === undefined) throw new Error(`calibração sem ${t}.probs.${k}`);
  return v / 100;
};
const pv = (C: Ctx, t: TeseId, k: string) => {
  const v = tc(C, t).valores?.[k];
  if (v === undefined) throw new Error(`calibração sem ${t}.valores.${k}`);
  return v;
};

// ---------------------------------------------------------------- regras transversais
// externo costuma não ter ponto: padrão "não havia" (art.62,I); se tiver ponto, a empresa controlava e valem as regras normais
const defPonto = (C: Ctx, padrao: string) => (C.local === 'externo' ? 'nao_havia' : padrao);
const reforca = (p: number, pts: number) => Math.min(0.92, p + pts); // reforço da testemunha em teses de perícia
const lim01 = (p: number) => Math.max(0.03, Math.min(0.92, p));
/** divisão segura: calibrar a chance-base em 0% não pode quebrar o cálculo (NaN). */
const razao = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? 1 : 0);
const ehJC = (C: Ctx) => C.saida === 'justa_causa';
// JUSTA CAUSA: ônus da empresa provar a falta grave — chance de reverter pesa em várias teses
const pRev = (C: Ctx) => pp(C, 'verbas_rescisorias',
  C.e.jcEmpresaTemProva ? (C.test ? 'jc_com_prova_test' : 'jc_com_prova') : (C.test ? 'jc_sem_prova_test' : 'jc_sem_prova'));
// multa de 40%: devida na dispensa sem justa causa e no vínculo reconhecido; RI e JC tratadas à parte; pedido de demissão não
const temMulta40 = (C: Ctx) => C.saida === 'sem_justa_causa' || C.saida === 'sem_registro';
// RESCISÃO INDIRETA: ônus do cliente provar a falta grave da empresa
const pRI = (C: Ctx) => {
  const f = C.e.riFalta ?? 'doc', R = (k: string) => pp(C, 'verbas_rescisorias', k);
  if (f === 'conduta') return C.test ? R('ri_conduta_test') : R('ri_conduta');
  return Math.min(0.92, (f === 'verbas' ? R('ri_verbas') : R('ri_doc')) + (C.test ? R('ri_reforco_test') : 0));
};
// VÍNCULO (sem registro): empresa nega → ônus do cliente; admite e diz autônomo/PJ → ônus da empresa
const pVinc = (C: Ctx) => {
  const R = (k: string) => pp(C, 'verbas_rescisorias', k), adm = !!C.e.vinculoEmpresaAdmite, doc = !!C.e.vinculoTemProva;
  if (adm) return C.test ? R('vinc_admite_test') : R('vinc_admite');
  return doc && C.test ? R('vinc_nega_doc_test') : doc ? R('vinc_nega_doc') : C.test ? R('vinc_nega_test') : R('vinc_nega_nada');
};
// indenização de estabilidade: salário + 13º (1/12) + férias+1/3 (1/12×4/3) + FGTS 8% + 40%
const REFL_ESTAB = 1 + 1 / 12 + (1 / 12) * (4 / 3) + 0.08 * 1.4;
// meses sem depósito já cobrados na tese de FGTS (com os 40%) — para não contar a multa duas vezes
const mesesSemDeposito = (C: Ctx) => !C.ativas.has('fgts') ? 0 : C.saida === 'sem_registro' ? C.m
  : Math.max(0, Math.min(num((C.e.respostas.fgts ?? {}).fgts_meses ?? 12), C.m));
type Parte = [string, number, number]; // [rótulo, valor, chance]
const somaPartes = (parts: Parte[]): [number, number] => {
  const br = parts.reduce((s, p) => s + p[1], 0);
  return [br, br > 0 ? parts.reduce((s, p) => s + p[1] * p[2], 0) / br : 0];
};
const brl = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const detPartes = (parts: Parte[]) => parts.map(p => `${p[0]} ${brl(p[1])} (${Math.round(p[2] * 100)}%)`).join(' · ');
const GRAV: Record<string, string> = { leve: 'leve', medio: 'média', grave: 'grave' };
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

// ---------------------------------------------------------------- cálculo de uma tese
export function calcularTese(t: TeseId, C: Ctx): Omit<ResultadoTese, 'excluida'> {
  const r: RespostasTese = C.e.respostas[t] ?? {};
  const g = <T,>(k: string, d: T): T | any => (r[k] !== undefined ? r[k] : d);
  const G = C.cal._geral;
  const reflexo = G.reflexo, sm = G.sm;
  let bruto = 0, prob = 0.5, det = '', aviso: Aviso = '';

  if (t === 'horas_extras') {
    bruto = C.sh * 1.5 * num(g('he_dia', 2)) * C.dm * C.m * reflexo;
    const ponto = g('he_ponto', defPonto(C, 'relogio')), real = g('he_real', 'sim') === 'sim', temPonto = ponto !== 'nao_havia';
    if (!temPonto && C.local === 'externo') { // art.62,I: ônus do CLIENTE, testemunha decide
      prob = C.test ? pp(C, t, 'externo_test') : pp(C, t, 'externo_sem_test');
      det = C.test ? 'externo sem ponto: ônus do cliente, testemunha é a prova' : 'externo sem ponto (art.62,I): ônus do cliente, SEM testemunha = quase perda';
    } else if (!temPonto) { // sem ponto: ônus da empresa só com 21+ funcionários (art.74 §2º, Súm.338,I)
      if (C.func > 20) { prob = C.test ? pp(C, t, 'forte_sem_ponto_test') : pp(C, t, 'forte_sem_ponto'); det = C.test ? 'sem ponto 21+ func + testemunha' : 'sem ponto 21+ func: ônus da empresa'; }
      else { prob = C.test ? pp(C, t, 'sem_ponto_peq_test') : pp(C, t, 'sem_ponto_peq'); det = C.test ? 'sem ponto até 20 func + testemunha' : 'sem ponto até 20 func'; }
    } else if (real) { // ponto real: decisivo é se a empresa pagou o que o ponto registra
      const pg = g('he_pagou', 'nao');
      if (pg === 'sim') { bruto = 0; prob = 0; det = 'extras do ponto pagas corretamente: nada a cobrar'; }
      else { if (pg === 'parte') bruto *= 0.5; prob = pp(C, t, 'ponto_real_nao_pagou');
        det = pg === 'parte' ? 'pagou só parte: cobra o saldo — o ponto prova' : 'ponto real e extras NÃO pagas: factual, o ponto prova'; }
    } else { // ponto não mostra o real (fraude): ônus do cliente; testemunha decide
      prob = C.test ? pp(C, t, 'fraude_com_test') : pp(C, t, 'fraude_sem_test');
      det = C.test ? 'fraude no ponto: testemunha derruba' : 'fraude no ponto SEM testemunha: ônus do cliente, quase perda';
    }
  }

  else if (t === 'intrajornada') {
    const min = num(g('intra_min', 30));
    bruto = min < 60 ? ((60 - min) / 60 * C.sh * 1.5 * C.dm * C.m) : 0;
    const reg = g('intra_registro', 'nao');
    if (reg === 'pre') { // pré-assinalação vale como prova da empresa → ônus do cliente; testemunha decide
      prob = C.test ? pp(C, t, 'pre_test') : pp(C, t, 'pre_sem_test');
      det = C.test ? 'ponto marca 1h mas não tirava: testemunha derruba a pré-assinalação' : 'ponto marca 1h, SEM testemunha: ônus do cliente, quase perda';
    } else if (reg === 'sim_suprimido') { prob = pp(C, t, 'ponto_real_suprimido'); det = 'ponto registra a supressão — prova pronta (Súm.437)'; }
    else if (C.local === 'externo') {
      prob = C.test ? pp(C, t, 'externo_test') : pp(C, t, 'externo_sem_test');
      det = C.test ? 'externo: ônus do cliente, testemunha é a prova' : 'externo (art.62): ônus do cliente, SEM testemunha = quase perda';
    } else if (C.func > 20) {
      prob = C.test ? pp(C, t, 'interno_sem_reg_test') : pp(C, t, 'interno_sem_reg');
      det = C.test ? '21+ func sem registro: ônus da empresa + testemunha' : '21+ func sem registro: ônus da empresa provar a concessão';
    } else {
      prob = C.test ? pp(C, t, 'peq_sem_reg_test') : pp(C, t, 'peq_sem_reg');
      det = C.test ? 'até 20 func sem registro: testemunha prova a supressão' : 'até 20 func sem registro, SEM testemunha: ônus do cliente, quase perda';
    }
  }

  else if (t === 'noturno') {
    bruto = num(g('not_h', 2)) * C.sh * 0.2 * C.dm * C.m * reflexo;
    const sit = g('not_sit', 'nao_pagou');
    if (sit === 'pagou') { bruto = 0; prob = 0; det = 'adicional pago corretamente: nada a cobrar'; }
    else if (sit === 'a_menor') { // pagava sem hora reduzida: diferença = 1/7 das horas a 120% (art.73 §1º)
      bruto = num(g('not_h', 2)) * (1 / 7) * C.sh * 1.2 * C.dm * C.m * reflexo;
      prob = pp(C, t, 'pagou_a_menor'); det = 'pagava sem hora reduzida: cobra só a diferença (art.73 §1º)';
    } else {
      const pt = g('not_ponto', defPonto(C, 'real'));
      if (pt === 'real') { prob = pp(C, t, 'ponto_real'); det = 'ponto registra o horário noturno e não pagava: factual'; }
      else if (C.local === 'externo') { prob = C.test ? pp(C, t, 'externo_test') : pp(C, t, 'externo_sem_test');
        det = C.test ? 'externo: ônus do cliente, testemunha prova o horário' : 'externo (art.62): ônus do cliente, SEM testemunha = quase perda'; }
      else if (pt === 'fraude') { prob = C.test ? pp(C, t, 'fraude_com_test') : pp(C, t, 'fraude_sem_test');
        det = C.test ? 'ponto não mostra o real: testemunha derruba' : 'ponto não mostra o real SEM testemunha: ônus do cliente, quase perda'; }
      else if (C.func > 20) { prob = C.test ? pp(C, t, 'grande_sem_ponto_test') : pp(C, t, 'grande_sem_ponto');
        det = 'sem ponto, 21+ func: ônus da empresa (Súm.338,I)' + (C.test ? ' + testemunha' : ''); }
      else { prob = C.test ? pp(C, t, 'peq_sem_ponto_test') : pp(C, t, 'peq_sem_ponto');
        det = C.test ? 'sem ponto, até 20 func: testemunha prova o horário' : 'sem ponto, até 20 func, SEM testemunha: ônus do cliente, sem prova'; }
    }
  }

  else if (t === 'insalubridade') {
    const A = tc(C, t).agentes!, CA = (catalogo as any).insalubridade.agentes;
    const ags = g('ins_agentes', []); const lst = (Array.isArray(ags) ? ags : (ags ? [ags] : [])).filter((a: string) => A[a]);
    if (!lst.length) { bruto = 0; prob = 0; aviso = 'MARQUE OS AGENTES'; det = 'marque os agentes de exposição'; }
    else if (g('ins_recebe', 'nao') === 'sim') { // já recebe: cobra só a DIFERENÇA de grau (maior grau, não soma)
      const grauMax = Math.max(...lst.map((a: string) => A[a].grau));
      const gr = ({ i10: 0.1, i20: 0.2, i40: 0.4 } as Record<string, number>)[g('ins_grau_recebe', 'i20')];
      const dif = Math.max(0, grauMax - gr);
      bruto = dif * sm * C.m * reflexo; prob = dif > 0 ? pp(C, t, 'ja_recebe') : 0;
      if (dif > 0 && C.test) prob = reforca(prob, pp(C, t, 'reforco_test'));
      det = dif > 0 ? `recebe ${Math.round(gr * 100)}%, devido ${Math.round(grauMax * 100)}%: cobra só a diferença${C.test ? ' · + testemunha' : ''}` : 'já recebe o grau devido: nada a cobrar';
    } else {
      const epiAgs = arr(g('ins_epi_ags', []));
      const comEpi = (a: string) => epiAgs.includes(a);
      const foraDoCaso = (a: string) => (a === 'ruido' && g('ins_ruido_nivel', 'alto') === 'moderado') || (a === 'poeira' && g('ins_poeira_tipo', 'mineral') === 'comum');
      const pAg = (a: string) => { const x = A[a]; let p = foraDoCaso(a) ? (x.prob_fora ?? x.prob) : x.prob; if (comEpi(a)) p = Math.min(p, x.prob_epi); return p / 100; };
      // agente principal = maior valor esperado (grau × chance); o valor NÃO soma graus
      const princ: string = lst.reduce((best: string, a: string) => (A[a].grau * pAg(a) > A[best].grau * pAg(best) ? a : best), lst[0]);
      bruto = A[princ].grau * sm * C.m * reflexo;
      prob = pAg(princ);
      // agravante: cada OUTRO agente que se enquadra (chance ≥ 30%) reforça a procedência
      const extras = lst.filter((a: string) => a !== princ && pAg(a) >= 0.30).length;
      if (extras) prob = Math.min(0.92, prob + pp(C, t, 'agravante') * extras);
      if (C.test) prob = reforca(prob, pp(C, t, 'reforco_test'));
      det = `principal: ${CA[princ].label} ${Math.round(A[princ].grau * 100)}%${extras ? ` · +${extras} agravante(s)` : ''}${comEpi(princ) ? ' · ' + CA[princ].epi + ' c/ ficha reduz' : ''}${foraDoCaso(princ) ? ' · ' + CA[princ].fora + ': não enquadra' : ''}${C.test ? ' · + testemunha' : ''}`;
    }
  }

  else if (t === 'periculosidade') {
    bruto = 0.3 * C.sal * C.m * reflexo;
    const ats = g('per_ativs', []); const lst = Array.isArray(ats) ? ats : (ats ? [ats] : []);
    const rec = g('per_recebe', 'nao');
    if (rec === 'sim') { bruto = 0; prob = 0; det = 'já recebe os 30%: nada a cobrar (periculosidade não tem grau)'; }
    else if (rec === 'base') { bruto = 0.3 * num(g('per_dif_base', 300)) * C.m * reflexo; prob = pp(C, t, 'ja_recebe');
      det = 'recebe sobre base errada: cobra só os 30% sobre o que ficou fora da base'; }
    else {
      const claros = ['eletricidade', 'inflamavel', 'vigilancia', 'moto', 'explosivo', 'radiacao'];
      const temClaro = lst.some((a: string) => claros.includes(a));
      prob = temClaro ? pp(C, t, 'enquadra_claro') : pp(C, t, 'enquadra_duvidoso');
      if (lst.length > 1) prob = Math.min(0.92, prob + 0.04 * (lst.length - 1));
      if (C.test) prob = reforca(prob, pp(C, t, 'reforco_test'));
      det = `${lst.length || 1} atividade(s)${lst.length > 1 ? ' · agravantes' : ''} (NR-16 / art.193 §4º)${C.test ? ' · + testemunha' : ''}`;
    }
  }

  else if (t === 'verbas_rescisorias') {
    const rk = g('resc', 'nada');
    const resc = ({ nada: 1, parcial: 0.5, tudo: 0 } as Record<string, number>)[rk];
    const anos = Math.floor(C.meses / 12);
    // férias: proporcionais + períodos completos não tirados (o mais recente simples, os anteriores em dobro — art.137);
    // no aniversário exato o último período acabou de fechar e não deu tempo de tirar → conta como não tirado
    const mFer = C.meses % 12, aniv = C.meses > 0 && mFer === 0;
    let nVenc = ({ sim: 0, ultimo: 1, dois: 2 } as Record<string, number>)[g('ferias_venc', 'sim')] ?? 0; if (aniv) nVenc = Math.max(nVenc, 1);
    nVenc = Math.min(nVenc, Math.floor(C.meses / 12));
    const fatorVenc = nVenc >= 1 ? 1 + (nVenc - 1) * 2 : 0;
    const mSemDep = mesesSemDeposito(C), doc = pp(C, t, 'documental'), S = C.saida;
    const saldo = C.vd * 15, dec = C.sal * 0.5, ferProp = C.sal * (mFer / 12) * (4 / 3), ferVenc = C.sal * fatorVenc * (4 / 3);
    const aviso_ = C.vd * Math.min(30 + 3 * anos, 90), multa40 = 0.4 * 0.08 * C.sal * Math.max(0, C.meses - mSemDep);
    // multa do art.477 (1 salário): 10 dias para pagar E entregar os documentos (§6º); vínculo reconhecido em juízo também gera (Súm.462)
    const p477 = rk !== 'tudo' ? doc : (({ sim: 0, atrasou: doc, guias: pp(C, t, 'multa477_guias') } as Record<string, number>)[g('prazo477', 'sim')] ?? 0);
    const parts: Parte[] = []; let cab = '';
    if (S === 'justa_causa') { const pr = pRev(C);
      parts.push(['devidas mesmo com justa causa (saldo, férias vencidas)', resc * (saldo + ferVenc), doc],
        ['multa 477', C.sal, p477],
        ['se reverter (aviso, 13º e férias proporcionais, multa 40%)', aviso_ + dec + ferProp + multa40, pr]);
      cab = `justa causa — reverter ${Math.round(pr * 100)}% (${C.e.jcEmpresaTemProva ? 'empresa tem prova' : 'empresa sem prova'}${C.test ? ' + testemunha' : ''})`;
    } else if (S === 'rescisao_indireta') { const pr = pRI(C);
      parts.push(['devidas de qualquer jeito (saldo, 13º, férias)', resc * (saldo + dec + ferProp + ferVenc), doc],
        ['se reconhecer (aviso, multa 40%, multa 477)', aviso_ + multa40 + C.sal, pr]);
      cab = `rescisão indireta — reconhecer ${Math.round(pr * 100)}%`;
    } else if (S === 'pedido_demissao') {
      parts.push(['saldo, 13º e férias', resc * (saldo + dec + ferProp + ferVenc), doc], ['multa 477', C.sal, p477]);
      cab = 'pedido de demissão: sem aviso e sem multa de 40%';
    } else if (S === 'sem_registro' && g('sr_13ferias', 'nao') === 'nao') {
      // sem registro: 13º e férias nunca pagos — período todo não prescrito (até 60 meses)
      const nP = Math.floor(Math.max(0, C.m - mFer) / 12), fv = nP >= 1 ? 1 + (nP - 1) * 2 : 0;
      parts.push(['saldo e aviso', saldo + aviso_, doc], [`13º de todo o período (${C.m} meses)`, C.sal * C.m / 12, doc],
        [`férias de todo o período (${nP} período(s)${nP > 1 ? `, ${nP - 1} em dobro` : ''}) + proporcionais`, C.sal * (fv + mFer / 12) * (4 / 3), doc],
        ['multa 40% FGTS', multa40, doc], ['multa 477 (Súm.462)', C.sal, doc]);
      cab = 'sem registro: 13º e férias de todo o período';
    } else {
      parts.push(['saldo, aviso, 13º e férias', resc * (saldo + aviso_ + dec + ferProp + ferVenc), doc], ['multa 40% FGTS', resc * multa40, doc],
        ['multa 477', C.sal, S === 'sem_registro' ? doc : p477]);
      cab = S === 'sem_registro' ? 'sem registro (recebia 13º e férias)' : 'dispensa sem justa causa';
    }
    const ok = parts.filter(p => p[1] > 0 && p[2] > 0);
    [bruto, prob] = somaPartes(ok);
    const srTodo = S === 'sem_registro' && g('sr_13ferias', 'nao') === 'nao';
    det = !ok.length ? 'pagou tudo e entregou as guias em até 10 dias: nada a cobrar'
      : srTodo ? `${cab} · ` + detPartes(ok)
      : `${cab} · férias ${mFer}/12` + (nVenc ? ` + ${nVenc} período(s) não tirado(s)${nVenc > 1 ? ' (em dobro)' : ''}` : '') + ' · ' + detPartes(ok);
  }

  else if (t === 'fgts') {
    const sr = C.saida === 'sem_registro';
    const digitado = sr ? C.m : num(g('fgts_meses', 12)), mFgts = Math.max(0, Math.min(digitado, C.m)); // Súm.362 e nunca acima do vínculo
    const ext = sr || g('fgts_extrato', 'sim') === 'sim', pf_ = ext ? pp(C, t, 'com_extrato') : pp(C, t, 'sem_extrato');
    const dep = 0.08 * C.sal * mFgts, parts: Parte[] = [['depósitos 8%', dep, pf_]];
    if (temMulta40(C)) parts.push(['multa 40%', dep * 0.4, pf_]);
    else if (ehJC(C)) parts.push(['multa 40% (se reverter a justa causa)', dep * 0.4, Math.min(pf_, pRev(C))]);
    else if (C.saida === 'rescisao_indireta') parts.push(['multa 40% (se reconhecer a rescisão indireta)', dep * 0.4, Math.min(pf_, pRI(C))]);
    [bruto, prob] = somaPartes(parts);
    det = (sr ? 'sem registro: nada foi depositado' : ext ? 'extrato prova' : 'sem extrato') + ` · ${mFgts} meses`
      + (C.meses > mFgts && mFgts === 60 ? ' (limitado a 60: prescrição)' : digitado > mFgts ? (mFgts === 60 ? ' (limitado a 60: prescrição)' : ' (limitado ao vínculo)') : '')
      + ' · ' + detPartes(parts) + (C.saida === 'pedido_demissao' ? ' · pedido de demissão: sem multa de 40%' : '');
  }

  else if (t === 'equiparacao') {
    bruto = num(g('eq_dif', 0)) * C.m * reflexo;
    if (g('eq_paradigma', 'nao') !== 'sim') { prob = pp(C, t, 'sem_paradigma'); det = 'não sabe o nome do colega (paradigma): quase perda'; }
    else { prob = C.test ? pp(C, t, 'paradigma_test') : pp(C, t, 'paradigma_sem_test'); det = C.test ? 'colega nomeado + testemunha' : 'colega nomeado, sem testemunha'; }
    if (!(num(g('eq_dif', 0)) > 0)) { aviso = 'INFORME A DIFERENÇA'; det = 'informe quanto o colega ganha a mais por mês'; }
  }

  else if (t === 'por_fora') {
    const v = num(g('pf_valor', 500)), f = g('pf_forma', 'pix');
    if (C.saida === 'sem_registro') { bruto = 0; prob = 0; aviso = 'NÃO SE APLICA';
      det = 'sem registro: o salário inteiro já é "por fora" e já entra em FGTS, 13º e férias — informe o salário total no topo'; }
    else { // o valor por fora já foi pago: cobra a integração = 13º + férias+1/3 + FGTS 8% (+40% só onde a saída dá direito)
      bruto = v * C.m * ((1 / 12) + (1 / 12) * (4 / 3) + 0.08 * (temMulta40(C) ? 1.4 : 1));
      if (f === 'pix') { prob = pp(C, t, 'pix'); det = 'PIX/extrato: prova documental'; }
      else if (f === 'recibo') { prob = pp(C, t, 'recibo'); det = 'recibo/anotação da própria empresa'; }
      else { prob = C.test ? pp(C, t, 'dinheiro_test') : pp(C, t, 'dinheiro_sem'); det = C.test ? 'dinheiro + testemunha' : 'dinheiro SEM testemunha: ônus do cliente, sem prova'; }
      det += ' · cobra os reflexos (o valor em si já foi pago) e entra na base das horas extras';
    }
  }

  else if (t === 'acidente' || t === 'doenca') {
    const ac = t === 'acidente', P = (k: string) => pp(C, t, k), q = (k: string) => (ac ? 'ac_' : 'do_') + k;
    const grav = g(q('grav'), 'leve'), inss = g(q('inss'), 'nao'), parts: Parte[] = [];
    // 1) dano moral — valor pela gravidade (planilha do escritório)
    let pdm: number;
    if (ac) {
      if (g('ac_tipo', 'tipico') === 'trajeto') pdm = g('ac_transp', 'nao') === 'sim' ? P('dm_trajeto_transp') : P('dm_trajeto');
      else { const c = arr(g('ac_culpa', [])); pdm = c.includes('risco') ? P('dm_risco') : c.length ? P('dm_culpa') : P('dm_sem_culpa'); }
      if (g('ac_doc', 'sim') === 'nao') pdm -= P('sem_doc');
    } else {
      const laudo = g('do_laudo', 'sim') === 'sim';
      pdm = !laudo ? P('dm_sem_laudo') : inss === 'b91' ? P('dm_b91') : P('dm_laudo');
      if (g('do_degen', 'nao') === 'sim') pdm -= P('degenerativa');
    }
    if (C.test) pdm += P('reforco_test');
    parts.push(['dano moral ' + GRAV[grav], pv(C, t, 'dm_' + grav), lim01(pdm)]);
    // 2) danos materiais — só se afastou pelo INSS ou sequela grave (pensão NÃO entra)
    if (inss !== 'nao' || grav === 'grave')
      parts.push(['danos materiais', pv(C, t, 'materiais_sal') * C.sal, lim01(P('materiais') + (C.test ? P('reforco_test') : 0) - (ac && g('ac_doc', 'sim') === 'nao' ? P('sem_doc') : 0))]);
    // 3) estabilidade de 12 meses (art.118). Acidente típico: só com afastamento (Súm.378,II). Doença: também sem afastamento (Tema 125) → 12 meses
    const afastou = inss !== 'nao';
    if (g(q('estab'), 'nao') === 'sim' && (afastou || !ac)) {
      const mr = afastou ? Math.max(0, 12 - num(g(q('meses_volta'), 3))) : 12;
      let direito: number;
      if (inss === 'b91') direito = 1;
      else if (ac) { direito = razao(P('estab_b31'), P('estab_b91')); if (g('ac_doc', 'sim') === 'nao') direito = Math.max(0, direito - P('sem_doc')); }
      else direito = razao(g('do_laudo', 'sim') === 'sim' ? P('estab_nexo_t125') : P('estab_sem_laudo'), P('estab_b91'));
      let pe: number;
      if (C.saida === 'pedido_demissao') pe = (g(q('sind'), 'nao') === 'sim' ? P('estab_pedido_sind') : P('estab_pedido')) * Math.min(1, direito);
      else pe = P('estab_b91') * Math.min(1, direito);
      if (ehJC(C)) pe *= pRev(C); else if (C.saida === 'rescisao_indireta') pe *= pRI(C);
      const motivo = inss === 'b91' ? ' (B91)' : ac ? ' (B31: converter em acidentário)' : afastou ? ' (B31: nexo por perícia)' : ' (Tema 125: nexo depois da saída)';
      if (mr > 0) parts.push([`estabilidade ${mr} meses${motivo}` + (ehJC(C) ? ' (se reverter a justa causa)' : C.saida === 'rescisao_indireta' ? ' (se reconhecer a rescisão indireta)' : ''), C.sal * mr * REFL_ESTAB, lim01(pe)]);
    }
    [bruto, prob] = somaPartes(parts);
    det = detPartes(parts) + ' · pensão não entra';
  }

  else if (t === 'gestante') {
    const P = (k: string) => pp(C, t, k), nasc = g('ge_momento', 'gravida') === 'nasceu';
    const mr = nasc ? Math.max(0, 5 - num(g('ge_meses_bebe', 1))) : Math.max(0, Math.min(14, 9 - num(g('ge_meses', 3)) + 5)); // até 5 meses após o parto
    // experiência = igual à dispensa (Tema 163); temporária = controverso; recusa de voltar NÃO pesa (Tema 134)
    const ct = g('ge_contrato', 'normal'); let pe: number, base_: string;
    const fatorCt = ct === 'temporario' ? razao(P('temporaria_2026'), P('dispensa')) : 1;
    const ctTxt = ct === 'temporario' ? ` · temporária: controverso (${Math.round(P('temporaria_2026') * 100)}%)` : ct === 'experiencia' ? ' · experiência: tem estabilidade (Tema 163)' : '';
    if (C.saida === 'pedido_demissao') { const sind = g('ge_sind', 'nao') === 'sim';
      pe = (sind ? (C.test ? P('pedido_com_sind_test') : P('pedido_com_sind')) : P('pedido_sem_sind')) * fatorCt;
      base_ = sind ? 'pediu a conta COM sindicato' + (C.test ? ' + testemunha da pressão' : '') : 'pediu a conta SEM sindicato: pedido inválido (art.500)';
    } else if (C.saida === 'rescisao_indireta') { const pr = pRI(C); pe = P('dispensa') * pr * fatorCt; base_ = `rescisão indireta: só se reconhecer (${Math.round(pr * 100)}%)`; }
    else if (ehJC(C)) { const pr = pRev(C); pe = P('dispensa') * pr * fatorCt; base_ = `justa causa: só se reverter (${Math.round(pr * 100)}%)`; }
    else { pe = P('dispensa') * fatorCt; base_ = 'dispensada: estabilidade objetiva'; }
    base_ += ctTxt;
    if (!nasc && g('ge_exame', 'sim') === 'nao') { pe = Math.min(pe, P('sem_exame')); base_ += ' · sem exame'; }
    pe = lim01(pe);
    if (mr <= 0) { bruto = 0; prob = 0; aviso = 'FORA DA ESTABILIDADE'; det = 'saiu depois dos 5 meses após o parto: não há estabilidade'; }
    else {
      const parts: Parte[] = [[`indenização ${mr} meses`, C.sal * mr * REFL_ESTAB, pe]];
      if (C.saida === 'pedido_demissao') { const anos = Math.floor(C.meses / 12); // pedido anulado vira dispensa: aviso + multa 40%
        parts.push(['conversão em dispensa (aviso + multa 40%)', C.vd * Math.min(30 + 3 * anos, 90) + 0.4 * 0.08 * C.sal * Math.max(0, C.meses - mesesSemDeposito(C)), pe]); }
      if (!C.ativas.has('dano_moral')) parts.push(['dano moral', pv(C, t, 'dm'), Math.min(pe, P('dm'))]); // regra D11
      [bruto, prob] = somaPartes(parts);
      det = base_ + ' · ' + detPartes(parts) + (C.ativas.has('dano_moral') ? ' · dano moral fica na tese de dano moral (D11)' : '');
    }
  }

  else if (t === 'dano_moral') {
    const S = tc(C, t).situacoes!;
    const sits = arr(g('dano_sits', [])).filter(k => S[k]);
    const provas = arr(g('dano_provas', []));
    const comDoc = (k: string) => provas.includes(k);
    const naoAplica = sits.filter(k => k === 'jc_improbidade' && !ehJC(C)).length; // acusação de furto só com justa causa
    const autoProva = (k: string) => k === 'informalidade' && C.saida === 'sem_registro'; // informalidade se prova com o vínculo
    const comProva = sits.filter(k => (C.test || comDoc(k) || autoProva(k)) && !(k === 'jc_improbidade' && !ehJC(C)));
    const semProva = sits.length - comProva.length - naoAplica;
    const pSit = (k: string) => { let p = Math.min(0.95, S[k].prob / 100 + (C.test && comDoc(k) ? pp(C, t, 'reforco_doc_test') : 0)); if (k === 'jc_improbidade') p = Math.min(p, pRev(C)); return p; };
    if (!sits.length) { bruto = 0; prob = 0; aviso = 'MARQUE AS SITUAÇÕES'; det = 'marque as situações de dano'; }
    else if (!comProva.length && naoAplica === sits.length) { bruto = 0; prob = 0; aviso = 'SÓ COM JUSTA CAUSA'; det = 'acusação de furto/desonestidade só vale se a saída foi por justa causa'; }
    else if (!comProva.length) { bruto = 0; prob = 0; aviso = 'SEM PROVA'; det = 'sem testemunha e sem documento: nenhuma situação entra (ônus do cliente)'; }
    else {
      bruto = comProva.reduce((s, k) => s + S[k].valor, 0);
      prob = bruto > 0 ? comProva.reduce((s, k) => s + S[k].valor * pSit(k), 0) / bruto : 0; // situação calibrada com valor 0 não quebra o cálculo
      const nDocTest = C.test ? comProva.filter(comDoc).length : 0;
      det = `${comProva.length} situação(ões) somam` + (C.test ? ' (testemunha prova)' : comProva.every(autoProva) ? '' : ' (com documento)')
        + (nDocTest ? ` · ${nDocTest} com documento + testemunha (reforço)` : '')
        + (semProva ? ` · ${semProva} sem documento não entra(m)` : '')
        + (naoAplica ? ' · acusação de furto só vale com justa causa' : '')
        + (comProva.some(autoProva) ? ' · informalidade: provada junto com o vínculo' : '');
    }
  }

  // SEM REGISTRO: sem vínculo reconhecido nenhuma tese existe — a chance do vínculo pesa em todas
  if (C.saida === 'sem_registro' && bruto > 0) { const pv_ = pVinc(C); prob *= pv_; det += ` · só se reconhecer o vínculo (${Math.round(pv_ * 100)}%)`; }
  const probAuto = prob;
  const ov = C.e.ajusteManual?.[t];
  const temOv = ov !== undefined && ov !== null;
  if (temOv) { prob = (ov as number) / 100; det = 'ajuste manual (auto era ' + Math.round(probAuto * 100) + '%)'; }
  const selo: Selo = prob >= G.selo_forte / 100 ? 'forte' : prob >= G.selo_media / 100 ? 'media' : 'fraca';
  return { tese: t, bruto, prob, probAuto, esperado: bruto * prob, selo, aviso, detalhe: det, ajusteManual: temOv };
}

// ---------------------------------------------------------------- classificação do caso
export function calcularCaso(e: Entrada, cal: Calibracao): ResultadoCaso {
  const C = contexto(e, cal), F = cal._faixas;
  const ativas = [...C.ativas];
  // art.193 §2º: insalubridade × periculosidade são excludentes — fica só a de maior valor
  let excluir: TeseId | null = null;
  if (C.ativas.has('insalubridade') && C.ativas.has('periculosidade')) {
    const ri = calcularTese('insalubridade', C), rp = calcularTese('periculosidade', C);
    excluir = ri.bruto >= rp.bruto ? 'periculosidade' : 'insalubridade';
  }
  let veTot = 0, vbTot = 0, veW = 0, vbW = 0;
  const teses: ResultadoTese[] = ativas.map(t => {
    const r = calcularTese(t, C), w = cal._pesos_tese?.[t] ?? 1, ex = t === excluir;
    const esp = ex ? 0 : r.esperado, bru = ex ? 0 : r.bruto;
    veTot += esp; vbTot += bru; veW += esp * w; vbW += bru * w;
    return { ...r, excluida: ex };
  });
  const solidez = vbW > 0 ? veW / vbW : 0;
  const score = Math.round(solidez * 100);
  const pTam = F.peso_tamanho / 100;
  const valorComposto = vbTot * (pTam + (1 - pTam) * solidez);
  const valorFaixa = F.base_faixa === 'bruto' ? vbTot : F.base_faixa === 'esperado' ? veTot : valorComposto;
  const fx = (v: number) => (v > F.limites[2] ? 3 : v > F.limites[1] ? 2 : v > F.limites[0] ? 1 : 0);
  const faltaPreencher = teses.filter(r => AVISOS_BLOQUEANTES.includes(r.aviso)).map(r => ({ tese: r.tese, aviso: r.aviso }));
  if (!ativas.length) {
    return { motor: MOTOR_VERSAO, teses, faltaPreencher, brutoTotal: 0, esperadoTotal: 0, solidez: 0, score: 0, valorComposto: 0,
      valorFaixa: 0, faixaPorValor: null, ajusteScore: null, faixa: null, comissao: 0, emRevisao: false };
  }
  const baseN = fx(valorFaixa);
  // ajuste pela qualidade: faixa de score a cada 10% move a faixa e/ou aplica % sobre a comissão
  const iBand = Math.min(9, Math.max(0, Math.floor(score / 10)));
  const band = F.score_faixas[iBand] ?? { mover_faixa: 0, pct_comissao: 100 };
  const nivel = Math.max(0, Math.min(3, baseN + band.mover_faixa));
  const comissao = Math.round(F.comissao[nivel] * band.pct_comissao / 100);
  return {
    motor: MOTOR_VERSAO, teses, faltaPreencher, brutoTotal: vbTot, esperadoTotal: veTot, solidez, score, valorComposto, valorFaixa,
    faixaPorValor: FAIXAS[baseN], ajusteScore: { faixaScore: iBand, mover: band.mover_faixa, pct: band.pct_comissao },
    faixa: FAIXAS[nivel], comissao, emRevisao: comissao === 0,
  };
}
