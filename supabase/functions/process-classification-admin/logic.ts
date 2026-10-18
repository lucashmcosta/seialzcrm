// Regras puras da edge process-classification-admin (calibração, Fase 4). Sem I/O; testadas em logic.test.ts.
// O admin vê todos os números, mas o motor nunca vai para o navegador: tudo que calcula roda aqui.

// @ts-types="../_shared/classificacao/motor.d.ts"
import * as Motor from "../_shared/classificacao/motor.mjs";
import { criarCanonicalizador, EntradaInvalida } from "../_shared/classificacao/canonicalizar.ts";

export type Cal = Record<string, unknown> & { _faixas: { limites: number[]; comissao: number[]; score_faixas: { mover_faixa: number; pct_comissao: number }[] } };
type Perms = { administracao?: Record<string, boolean> } | null;

export const podeCalibrar = (p: Perms) => p?.administracao?.calibrar_classificacao === true;
export const podePublicar = (p: Perms) => p?.administracao?.publicar_calibracao === true;

const { canonicalizar } = criarCanonicalizador(Motor);

export class Recusa extends Error {
  constructor(public status: number, public codigo: string, public mensagem: string, public extra?: Record<string, unknown>) {
    super(codigo);
  }
}

/**
 * Rascunho só com as chaves que o motor conhece: o mesmo "Importar" do protótipo (mesclarCalibracao) por cima da base.
 * Chave desconhecida é ignorada e listada; número que falta fica com o valor da base.
 */
export function normalizarRascunho(conteudo: unknown, base: Cal) {
  try {
    const { calibracao, aplicados, ignorados } = Motor.mesclarCalibracao(conteudo, base);
    calibracao._motor = Motor.MOTOR_VERSAO;
    return { calibracao: calibracao as Cal, aplicados, ignorados };
  } catch {
    throw new Recusa(422, "formato_invalido", "O arquivo não está no formato de calibração.");
  }
}

export const conferir = (cal: Cal): string[] => Motor.conferirCalibracao(cal);
export const comparar = (a: Cal, b: Cal) => Motor.compararCalibracoes(a, b);

export const FAIXAS = ["PRATA", "OURO", "TITANIO", "DIAMANTE"] as const;

/**
 * Matriz "faixa por valor × faixa de score" (§8.1): para cada combinação, a faixa final e a comissão.
 * Repete a regra final do calcularCaso (o motor não a exporta); o teste de paridade nos casos-ouro garante que
 * continua igual ao motor.
 */
export function matrizFaixas(cal: Cal) {
  const F = cal._faixas;
  return FAIXAS.map((_, base) =>
    F.score_faixas.map((band) => {
      const nivel = Math.max(0, Math.min(3, base + band.mover_faixa));
      const comissao = Math.round(F.comissao[nivel] * band.pct_comissao / 100);
      return { faixa: FAIXAS[nivel], comissao, emRevisao: comissao === 0 };
    }));
}

/** Simulação do admin: tudo do ResultadoCaso (chances, valores, detalhe por tese). */
export function simular(entradaBruta: unknown, cal: Cal) {
  let entrada: Record<string, unknown>;
  try {
    entrada = canonicalizar(entradaBruta);
  } catch (e) {
    if (e instanceof EntradaInvalida) throw new Recusa(422, "entrada_invalida", "Confira as respostas.", { campo: e.campo });
    throw e;
  }
  return { entrada, resultado: Motor.calcularCaso(entrada, cal) };
}

export interface LinhaImpacto {
  classificationId: string; opportunityId: string; sellerId: string; input: Record<string, unknown>;
  band: string | null; commission: number;
}

/** Prévia de impacto (§8.3): recalcula com o rascunho as classificações ativas (Entrada gravada). Não grava nada. */
export function previaImpacto(linhas: LinhaImpacto[], rascunho: Cal, maiores = 20) {
  const idx = (f: string | null) => (f ? FAIXAS.indexOf(f as typeof FAIXAS[number]) : -1);
  const matriz = FAIXAS.map(() => FAIXAS.map(() => 0));
  let sobem = 0, descem = 0, ficam = 0, totalAtual = 0, totalNova = 0, erros = 0;
  const porVendedor = new Map<string, { atual: number; nova: number; casos: number }>();
  const mudancas: { classificationId: string; opportunityId: string; de: { faixa: string | null; comissao: number }; para: { faixa: string | null; comissao: number } }[] = [];
  for (const l of linhas) {
    let r: { faixa: string | null; comissao: number };
    try { r = Motor.calcularCaso(l.input, rascunho); } catch { erros++; continue; }
    const a = idx(l.band), n = idx(r.faixa);
    if (a >= 0 && n >= 0) matriz[a][n]++;
    if (n > a) sobem++; else if (n < a) descem++; else ficam++;
    totalAtual += l.commission; totalNova += r.comissao;
    const v = porVendedor.get(l.sellerId) ?? { atual: 0, nova: 0, casos: 0 };
    v.atual += l.commission; v.nova += r.comissao; v.casos++;
    porVendedor.set(l.sellerId, v);
    if (r.comissao !== l.commission || r.faixa !== l.band) {
      mudancas.push({ classificationId: l.classificationId, opportunityId: l.opportunityId,
        de: { faixa: l.band, comissao: l.commission }, para: { faixa: r.faixa, comissao: r.comissao } });
    }
  }
  mudancas.sort((x, y) => Math.abs(y.para.comissao - y.de.comissao) - Math.abs(x.para.comissao - x.de.comissao));
  return {
    casos: linhas.length - erros, erros, sobem, descem, ficam, matriz, totalAtual, totalNova,
    porVendedor: [...porVendedor.entries()].map(([sellerId, v]) => ({ sellerId, ...v, diferenca: v.nova - v.atual }))
      .sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca)),
    maioresMudancas: mudancas.slice(0, maiores),
  };
}

export const MOTOR_VERSAO = Motor.MOTOR_VERSAO as string;
export const CATALOGO = Motor.CATALOGO;
export const CALIBRACAO_PADRAO = Motor.CALIBRACAO_V1 as Cal;
