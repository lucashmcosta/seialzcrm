// Estado do assistente do vendedor e montagem da Entrada (§5.2). Puro: testado em rascunho.test.ts.
import {
  AUTO_SEM_REGISTRO, AUTO_SEM_REGISTRO_SITUACAO, EntradaInvalida, NOME_TESE, PASSO_DADOS, PASSO_SAIDA, PERGUNTAS,
  canonicalizar, pendenciaDaTese, respostasDaTese, type CtxPergunta, type Pergunta, type TeseId,
} from './perguntas';

export type Resposta = string | number | string[] | undefined;

export interface Rascunho {
  /** Campos do topo (passos 1 e 2). Números como digitados; sim/não como 'sim' | 'nao'. */
  topo: Record<string, string | undefined>;
  /** Teses na ordem em que foram marcadas. */
  teses: TeseId[];
  respostas: Partial<Record<TeseId, Record<string, Resposta>>>;
}

export const TESES = Object.keys(PERGUNTAS) as TeseId[];

export function rascunhoInicial(): Rascunho {
  const topo: Record<string, string | undefined> = {};
  for (const p of [...PASSO_DADOS, ...PASSO_SAIDA]) if (p.padrao !== undefined) topo[p.campo as string] = String(p.padrao);
  return { topo, teses: [], respostas: {} };
}

/** "1.234,56" → 1234.56 · "1.200" → 1200 · "2.5" → 2.5; vazio ou inválido → undefined. */
export function numeroBR(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().replace(/\s|R\$/g, '');
  if (!s) return undefined;
  // vírgula = decimal; sem vírgula, "1.200" (grupos de 3) é milhar e "2.5" é decimal
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  return Number.isFinite(n) ? n : undefined;
}

/** Topo como o canonicalizador espera (números convertidos; sim/não continuam 'sim'/'nao'). */
function topoBruto(r: Rascunho): Record<string, unknown> {
  const e: Record<string, unknown> = {};
  for (const p of PASSO_DADOS) e[p.campo as string] = numeroBR(r.topo[p.campo as string]);
  for (const p of PASSO_SAIDA) e[p.campo as string] = r.topo[p.campo as string];
  return e;
}

/** Perguntas do passo 2 que aparecem agora (dependem da saída). */
export function topoVisivel(r: Rascunho) {
  const e = topoBruto(r);
  return PASSO_SAIDA.filter((p) => !p.cond || p.cond(e as never));
}

/** Mensagens de erro do passo 1 (mesmas do protótipo). */
export function errosDados(r: Rascunho): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PASSO_DADOS) {
    const n = numeroBR(r.topo[p.campo as string]);
    const msg = n === undefined ? (p.validar?.(0) || 'Informe um número.') : p.validar?.(n) ?? '';
    if (msg) out[p.campo as string] = msg;
  }
  return out;
}

export function contexto(r: Rascunho): CtxPergunta {
  const e = topoBruto(r);
  return {
    saida: (e.saida ?? 'sem_justa_causa') as CtxPergunta['saida'],
    local: (e.local ?? 'interno') as CtxPergunta['local'],
    meses: (e.meses as number) ?? 0,
    testemunha: e.testemunha === 'sim',
    teses: r.teses,
  };
}

/** Escolher a saída. Ao entrar em "Sem registro", marca sozinho as teses de AUTO_SEM_REGISTRO e "informalidade". */
export function escolherSaida(r: Rascunho, saida: string): Rascunho {
  const novo: Rascunho = { ...r, topo: { ...r.topo, saida } };
  if (saida !== 'sem_registro' || r.topo.saida === 'sem_registro') return novo;
  const teses = [...r.teses];
  for (const t of AUTO_SEM_REGISTRO as TeseId[]) if (!teses.includes(t)) teses.push(t);
  const dano = { ...(r.respostas.dano_moral ?? {}) };
  const sits = Array.isArray(dano.dano_sits) ? [...(dano.dano_sits as string[])] : [];
  if (!sits.includes(AUTO_SEM_REGISTRO_SITUACAO)) sits.push(AUTO_SEM_REGISTRO_SITUACAO);
  dano.dano_sits = sits;
  return { ...novo, teses, respostas: { ...r.respostas, dano_moral: dano } };
}

export function alternarTese(r: Rascunho, t: TeseId): Rascunho {
  return { ...r, teses: r.teses.includes(t) ? r.teses.filter((x) => x !== t) : [...r.teses, t] };
}

export function responder(r: Rascunho, t: TeseId, id: string, v: Resposta): Rascunho {
  return { ...r, respostas: { ...r.respostas, [t]: { ...(r.respostas[t] ?? {}), [id]: v } } };
}

/**
 * Tela de uma tese: perguntas visíveis com o valor que a tela mostra (o valor marcado quando o vendedor
 * não mexeu). É o mesmo cálculo do servidor, então "valor na tela = valor que o motor assume".
 */
export function telaDaTese(r: Rascunho, t: TeseId): { perguntas: Pergunta[]; valores: Record<string, Resposta>; erro: string } {
  const ctx = contexto(r);
  const brutas: Record<string, Resposta> = Object.fromEntries(Object.entries(r.respostas[t] ?? {}).filter(([, v]) => v !== undefined));
  let erro = '';
  // Resposta inválida (ex.: número negativo) sai do cálculo da tela e trava o "Próximo" com a mensagem.
  for (let i = 0, max = Object.keys(brutas).length; i <= max; i++) {
    try {
      const valores = respostasDaTese(t, brutas, ctx as never) as Record<string, Resposta>;
      const ids = new Set(Object.keys(valores));
      return { perguntas: PERGUNTAS[t].filter((p) => ids.has(p.id)), valores, erro };
    } catch (e) {
      if (!(e instanceof EntradaInvalida)) throw e;
      erro = e.codigo === 'numero_invalido' ? 'Confira os números: use só valores positivos.' : 'Confira as respostas.';
      delete brutas[e.campo.split('.')[1]];
    }
  }
  throw new Error('respostas_instaveis');
}

/** Mensagem que trava o "Próximo" na tela da tese (ou ''). */
export function pendencia(r: Rascunho, t: TeseId): string {
  const tela = telaDaTese(r, t);
  return tela.erro || pendenciaDaTese(t, tela.valores as never);
}

/** Entrada que vai para o servidor: todas as perguntas visíveis, com o valor marcado, nada escondido. */
export function montarEntrada(r: Rascunho): Record<string, unknown> {
  return canonicalizar({ ...topoBruto(r), teses: r.teses, respostas: r.respostas });
}

export const nomeTese = (t: TeseId) => NOME_TESE[t];

const SIM_NAO_TOPO = new Set(['testemunha', 'vinculoEmpresaAdmite', 'vinculoTemProva', 'jcEmpresaTemProva']);

/** Entrada gravada → rascunho da tela (certificação começa com as respostas do vendedor). Ida e volta é exata. */
export function rascunhoDeEntrada(e: Record<string, unknown>): Rascunho {
  const r = rascunhoInicial();
  for (const p of [...PASSO_DADOS, ...PASSO_SAIDA]) {
    const v = e[p.campo as string];
    if (v === undefined) continue;
    r.topo[p.campo as string] = SIM_NAO_TOPO.has(p.campo as string) ? (v ? 'sim' : 'nao') : String(v);
  }
  r.teses = [...((e.teses ?? []) as TeseId[])];
  r.respostas = JSON.parse(JSON.stringify(e.respostas ?? {}));
  return r;
}

/** Rótulo legível de um campo alterado na certificação ("testemunha", "horas_extras.he_dia", "+fgts", "-fgts"). */
export function rotuloCampo(caminho: string): string {
  if (caminho.startsWith('+')) return `Tese incluída: ${NOME_TESE[caminho.slice(1) as TeseId] ?? caminho.slice(1)}`;
  if (caminho.startsWith('-')) return `Tese removida: ${NOME_TESE[caminho.slice(1) as TeseId] ?? caminho.slice(1)}`;
  const [t, id] = caminho.split('.');
  if (!id) return [...PASSO_DADOS, ...PASSO_SAIDA].find((p) => p.campo === t)?.rotulo ?? t;
  const p = PERGUNTAS[t as TeseId]?.find((q) => q.id === id);
  const rotulo = p && typeof p.rotulo === 'string' ? p.rotulo : id;
  return `${NOME_TESE[t as TeseId] ?? t} — ${rotulo}`;
}
