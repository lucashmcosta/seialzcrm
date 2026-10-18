// Canonicaliza a Entrada da classificação de processos (Central Trabalhista).
// Usado pela edge function (com o motor.mjs) e pelo widget do vendedor (só com perguntas.ts).
// Não depende de Deno nem do navegador: as perguntas do motor são injetadas.
//
// Por que existe: o motor confia na Entrada (inclusive em `ajusteManual`). O servidor nunca usa o que
// o navegador mandou "como veio": reconstrói a Entrada só com os campos e perguntas que a tela
// mostraria, valida cada valor contra as opções e completa com o valor marcado (padraoDe).

export type TeseId = string;
export type Valor = string | number | string[];
type Opcao = [string, string];

export interface PerguntaApi {
  id: string;
  tipo: "chip" | "select" | "multi" | "num";
  opcoes?: Opcao[] | ((r: Record<string, unknown>, c: Ctx, cal?: unknown) => Opcao[]);
  padrao?: unknown;
  cond?: (r: Record<string, unknown>, c: Ctx) => boolean;
}
export interface PerguntaTopoApi {
  campo: string;
  tipo: "num" | "select" | "chip";
  opcoes?: Opcao[];
  padrao?: string | number;
  cond?: (e: Record<string, unknown>) => boolean;
  validar?: (v: number) => string;
}
export interface Ctx { saida: string; local: string; meses: number; testemunha: boolean; teses: TeseId[] }

/** O pedaço de perguntas.ts de que o canonicalizador precisa. */
export interface PerguntasApi {
  PERGUNTAS: Record<TeseId, PerguntaApi[]>;
  PASSO_DADOS: PerguntaTopoApi[];
  PASSO_SAIDA: PerguntaTopoApi[];
  perguntasVisiveis: (t: TeseId, r: Record<string, unknown>, c: Ctx) => PerguntaApi[];
  padraoDe: (p: PerguntaApi, c: Ctx) => Valor;
}

/** Erro de entrada. Nunca carrega o valor recebido (não vai para log nem para a resposta). */
export class EntradaInvalida extends Error {
  constructor(public codigo: string, public campo: string) {
    super(`${codigo}:${campo}`);
  }
}

// Campos sim/não do topo: na tela são chips 'sim'/'nao'; na Entrada viram boolean.
const BOOLEANOS = new Set(["testemunha", "vinculoEmpresaAdmite", "vinculoTemProva", "jcEmpresaTemProva"]);
const NUM_MAX = 1e9;
const MAX_ITERACOES = 10;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function numero(v: unknown, campo: string): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > NUM_MAX) throw new EntradaInvalida("numero_invalido", campo);
  return n;
}

function opcoesDe(p: PerguntaApi, r: Record<string, unknown>, c: Ctx): string[] {
  const o = typeof p.opcoes === "function" ? p.opcoes(r, c, undefined) : p.opcoes ?? [];
  return o.map(([v]) => v);
}

function valorDaPergunta(p: PerguntaApi, v: unknown, r: Record<string, unknown>, c: Ctx, campo: string): Valor {
  if (p.tipo === "num") return numero(v, campo);
  const validas = opcoesDe(p, r, c);
  if (p.tipo === "multi") {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new EntradaInvalida("opcao_invalida", campo);
    // Opções que dependem de outra resposta (EPI por agente, provas por situação) somem quando a
    // resposta de origem é desmarcada: a tela também não mostra mais essas opções, então saem daqui.
    return [...new Set((v as string[]).filter((x) => validas.includes(x)))];
  }
  if (typeof v !== "string" || !validas.includes(v)) throw new EntradaInvalida("opcao_invalida", campo);
  return v;
}

export function criarCanonicalizador(api: PerguntasApi) {
  const TESES = Object.keys(api.PERGUNTAS);

  function topo(bruta: Record<string, unknown>): Record<string, unknown> {
    const e: Record<string, unknown> = {};
    for (const p of api.PASSO_DADOS) {
      const v = bruta[p.campo] ?? p.padrao;
      const n = numero(v, p.campo);
      if (p.validar?.(n)) throw new EntradaInvalida("numero_invalido", p.campo);
      e[p.campo] = n;
    }
    // A ordem de PASSO_SAIDA é a da tela: 'saida' vem primeiro e as condições dependem dela.
    for (const p of api.PASSO_SAIDA) {
      if (p.cond && !p.cond(e)) continue;
      let v = bruta[p.campo];
      if (BOOLEANOS.has(p.campo) && typeof v === "boolean") v = v ? "sim" : "nao";
      if (v === undefined || v === null) v = p.padrao;
      const validas = (p.opcoes ?? []).map(([x]) => x);
      if (typeof v !== "string" || !validas.includes(v)) throw new EntradaInvalida("opcao_invalida", p.campo);
      e[p.campo] = BOOLEANOS.has(p.campo) ? v === "sim" : v;
    }
    return e;
  }

  /** Respostas de uma tese: só as perguntas visíveis, com o valor validado ou o valor marcado. */
  function respostasDaTese(t: TeseId, brutas: Record<string, unknown>, c: Ctx): Record<string, Valor> {
    const permitidas = new Set(api.PERGUNTAS[t].map((p) => p.id));
    const recebidas: Record<string, unknown> = Object.fromEntries(Object.entries(brutas).filter(([k]) => permitidas.has(k)));
    // Ponto fixo: a visibilidade é calculada só com as respostas que ficam (as escondidas não contam),
    // e cada pergunta visível leva a resposta recebida ou o valor marcado. Esconder ou completar uma
    // resposta pode mostrar outra pergunta, por isso repete até estabilizar.
    let r: Record<string, unknown> = recebidas;
    for (let i = 0; i < MAX_ITERACOES; i++) {
      const prox: Record<string, Valor> = {};
      for (const p of api.perguntasVisiveis(t, r, c)) {
        const v = recebidas[p.id];
        prox[p.id] = v === undefined || v === null || v === "" ? api.padraoDe(p, c) : valorDaPergunta(p, v, prox, c, `${t}.${p.id}`);
      }
      if (JSON.stringify(prox) === JSON.stringify(r)) return prox;
      r = prox;
    }
    throw new EntradaInvalida("respostas_instaveis", t);
  }

  /**
   * Devolve a Entrada canônica, ou lança EntradaInvalida.
   * Descarta tudo o que a tela não mostra: campos desconhecidos, perguntas escondidas,
   * respostas de teses não marcadas e `ajusteManual` (só o gestor ajusta, e não pela API do vendedor).
   */
  function canonicalizar(bruta: unknown): Record<string, unknown> {
    if (!ehObjeto(bruta)) throw new EntradaInvalida("formato_invalido", "entrada");
    const e = topo(bruta);
    const teses = bruta.teses;
    if (!Array.isArray(teses) || teses.length === 0) throw new EntradaInvalida("sem_teses", "teses");
    if (teses.some((t) => typeof t !== "string" || !TESES.includes(t))) throw new EntradaInvalida("tese_invalida", "teses");
    e.teses = [...new Set(teses as string[])];
    const c: Ctx = {
      saida: e.saida as string, local: e.local as string, meses: e.meses as number,
      testemunha: e.testemunha as boolean, teses: e.teses as TeseId[],
    };
    const brutas = ehObjeto(bruta.respostas) ? bruta.respostas : {};
    const respostas: Record<string, Record<string, Valor>> = {};
    for (const t of e.teses as TeseId[]) {
      const rt = brutas[t];
      respostas[t] = respostasDaTese(t, ehObjeto(rt) ? rt : {}, c);
    }
    e.respostas = respostas;
    return e;
  }

  return { canonicalizar, respostasDaTese };
}
