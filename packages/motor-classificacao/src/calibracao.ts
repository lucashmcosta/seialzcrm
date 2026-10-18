// Ferramentas da calibração para a tela do administrador: importar (mesclar), conferir antes de publicar e comparar versões.
import type { Calibracao, TeseId } from './tipos';
import { CALIBRACAO_V1 } from './calibracao-v1';
import { CATALOGO } from './catalogo';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const num = (v: unknown) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));
const TESES = Object.keys(CATALOGO) as TeseId[];

/**
 * Importa uma calibração (o JSON exportado do protótipo, ou de uma versão anterior) por cima de uma base.
 * Igual ao "Importar" do protótipo: só aplica o que existe na versão atual — número novo fica com o valor da base,
 * número que saiu é ignorado. Nunca altera a base recebida.
 */
export function mesclarCalibracao(importada: unknown, base: Calibracao = CALIBRACAO_V1): { calibracao: Calibracao; aplicados: number; ignorados: string[] } {
  if (!importada || typeof importada !== 'object' || Array.isArray(importada)) throw new Error('formato inválido');
  const o = importada as any, c = clone(base) as any, ignorados: string[] = [];
  let aplicados = 0;
  for (const t of TESES) {
    const x = o[t], b = c[t];
    if (!x || typeof x !== 'object') continue;
    for (const grupo of ['probs', 'valores'] as const) if (x[grupo]) for (const k in x[grupo]) {
      if (b[grupo] && k in b[grupo] && num(x[grupo][k])) { b[grupo][k] = +x[grupo][k]; aplicados++; } else ignorados.push(`${t}.${grupo}.${k}`);
    }
    if (x.situacoes) for (const k in x.situacoes) {
      const s = b.situacoes?.[k], y = x.situacoes[k];
      if (s && y) { if (num(y.valor)) s.valor = +y.valor; if (num(y.prob)) s.prob = +y.prob; aplicados++; } else ignorados.push(`${t}.situacoes.${k}`);
    }
    if (x.agentes) for (const a in x.agentes) {
      const s = b.agentes?.[a], y = x.agentes[a];
      if (s && y) { for (const f of ['grau', 'prob', 'prob_epi', 'prob_fora']) if (s[f] !== undefined && num(y[f])) s[f] = +y[f]; aplicados++; }
      else ignorados.push(`${t}.agentes.${a}`);
    }
  }
  if (o._pesos_tese) for (const t in o._pesos_tese) if (TESES.includes(t as TeseId) && num(o._pesos_tese[t])) c._pesos_tese[t] = +o._pesos_tese[t];
  const f = o._faixas || {};
  if (Array.isArray(f.limites)) f.limites.forEach((v: unknown, i: number) => { if (i < 3 && num(v)) c._faixas.limites[i] = +(v as number); });
  if (Array.isArray(f.comissao)) f.comissao.forEach((v: unknown, i: number) => { if (i < 4 && num(v)) c._faixas.comissao[i] = +(v as number); });
  if (num(f.peso_tamanho)) c._faixas.peso_tamanho = +f.peso_tamanho;
  if (['composto', 'bruto', 'esperado'].includes(f.base_faixa)) c._faixas.base_faixa = f.base_faixa;
  if (Array.isArray(f.score_faixas)) f.score_faixas.forEach((b: any, i: number) => {
    if (i < 10 && b) {
      if (num(b.mover_faixa)) c._faixas.score_faixas[i].mover_faixa = Math.max(-3, Math.min(2, Math.round(+b.mover_faixa)));
      if (num(b.pct_comissao)) c._faixas.score_faixas[i].pct_comissao = Math.max(0, +b.pct_comissao);
    }
  });
  const g = o._geral || {};
  for (const k of ['selo_forte', 'selo_media', 'sm', 'reflexo']) if (num(g[k])) c._geral[k] = +g[k];
  return { calibracao: c, aplicados, ignorados };
}

/** Problemas que impedem publicar uma versão (lista vazia = pode publicar). */
export function conferirCalibracao(cal: Calibracao): string[] {
  const p: string[] = [], c = cal as any;
  for (const t of TESES) {
    const x = c[t];
    if (!x?.probs) { p.push(`${t}: sem as chances`); continue; }
    for (const k in x.probs) if (!num(x.probs[k]) || x.probs[k] < 0 || x.probs[k] > 100) p.push(`${t}.${k}: chance precisa ficar entre 0 e 100`);
    for (const k in x.valores ?? {}) if (!num(x.valores[k]) || x.valores[k] < 0) p.push(`${t}.${k}: valor não pode ser negativo`);
    for (const k in x.situacoes ?? {}) { const s = x.situacoes[k];
      if (!(s.prob >= 0 && s.prob <= 100)) p.push(`${t}.${k}: chance precisa ficar entre 0 e 100`);
      if (!(s.valor >= 0)) p.push(`${t}.${k}: valor não pode ser negativo`); }
    for (const a in x.agentes ?? {}) { const s = x.agentes[a];
      if (![0.1, 0.2, 0.4].includes(s.grau)) p.push(`${t}.${a}: grau precisa ser 10%, 20% ou 40%`);
      for (const f of ['prob', 'prob_epi', 'prob_fora']) if (s[f] !== undefined && !(s[f] >= 0 && s[f] <= 100)) p.push(`${t}.${a}.${f}: chance precisa ficar entre 0 e 100`); }
    const w = c._pesos_tese?.[t]; if (w !== undefined && !(w >= 0)) p.push(`${t}: peso da tese não pode ser negativo`);
  }
  const F = c._faixas ?? {}, l = F.limites ?? [];
  if (!(l.length === 3 && l[0] > 0 && l[0] < l[1] && l[1] < l[2])) p.push('Faixas: os limites precisam ser crescentes (Prata→Ouro < Ouro→Titânio < Titânio→Diamante)');
  if (!(Array.isArray(F.comissao) && F.comissao.length === 4 && F.comissao.every((v: number) => v >= 0))) p.push('Comissão: 4 valores, nenhum negativo');
  if (!(F.peso_tamanho >= 0 && F.peso_tamanho <= 100)) p.push('Peso do tamanho: entre 0 e 100');
  if (!['composto', 'bruto', 'esperado'].includes(F.base_faixa)) p.push('Base da faixa inválida');
  if (!(Array.isArray(F.score_faixas) && F.score_faixas.length === 10)) p.push('Faixas de score: precisam ser 10');
  else F.score_faixas.forEach((b: any, i: number) => {
    if (!(Number.isInteger(b.mover_faixa) && b.mover_faixa >= -3 && b.mover_faixa <= 2)) p.push(`Score ${i * 10}%: mover faixa entre −3 e +2`);
    if (!(b.pct_comissao >= 0)) p.push(`Score ${i * 10}%: % da comissão não pode ser negativo`);
  });
  const G = c._geral ?? {};
  if (!(G.selo_media >= 0 && G.selo_media <= G.selo_forte && G.selo_forte <= 100)) p.push('Selos: média ≤ forte, entre 0 e 100');
  if (!(G.sm > 0)) p.push('Salário mínimo precisa ser maior que 0');
  if (!(G.reflexo >= 1)) p.push('Reflexo precisa ser 1 ou mais');
  return p;
}

export interface Mudanca { caminho: string; rotulo: string; antes: unknown; depois: unknown }
/** Lista o que mudou entre duas versões, com o rótulo legível de cada número (para o histórico e para a nota de publicação). */
export function compararCalibracoes(a: Calibracao, b: Calibracao): Mudanca[] {
  const out: Mudanca[] = [], cat = CATALOGO as any;
  const rot = (cam: string[]) => {
    const [t, g, k, f] = cam;
    if (t === '_faixas') return `Faixas e comissão › ${cam.slice(1).join(' › ')}`;
    if (t === '_geral') return `Geral › ${g}`;
    if (t === '_pesos_tese') return `Peso da tese › ${cat[g]?.nome ?? g}`;
    const nome = cat[t]?.nome ?? t;
    const lab = g === 'probs' ? cat[t]?.probs?.[k]?.label : g === 'valores' ? cat[t]?.valores?.[k]?.label
      : g === 'agentes' ? cat[t]?.agentes?.[k]?.label : g === 'situacoes' ? cat[t]?.situacoes?.[k]?.label : undefined;
    return `${nome} › ${lab ?? k}${f ? ` › ${f}` : ''}`;
  };
  const anda = (x: any, y: any, cam: string[]) => {
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!k.startsWith('_salvo') && k !== '_versao' && k !== '_motor') anda(x[k], y[k], [...cam, k]);
    } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ caminho: cam.join('.'), rotulo: rot(cam), antes: x, depois: y });
  };
  anda(a, b, []);
  return out;
}
