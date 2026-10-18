import { NOME_TESE, PASSO_SAIDA, PERGUNTAS, SAIDAS, type CtxPergunta, type TeseId } from './perguntas';
import { formatarBRL } from './formato';

/** Entrada canônica (ver supabase/functions/_shared/classificacao/canonicalizar.ts). */
interface Entrada {
  salario: number; meses: number; funcionarios: number; diasSemana: number;
  saida: CtxPergunta['saida']; local: CtxPergunta['local']; testemunha: boolean;
  teses?: TeseId[]; respostas?: Partial<Record<TeseId, Record<string, unknown>>>;
  [campo: string]: unknown;
}

const linha = (t: string, v: string) => (
  <div key={t} className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-muted-foreground">{t}</span><span className="text-right font-medium">{v}</span>
  </div>
);

const simNao = (v: unknown) => (v === true ? 'Sim' : v === false ? 'Não' : String(v ?? '—'));

function valorLegivel(opcoes: readonly (readonly [string, string])[], v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.map((x) => opcoes.find(([k]) => k === x)?.[1] ?? x).join(', ') : 'Nenhuma';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  return opcoes.find(([k]) => k === v)?.[1] ?? String(v ?? '—');
}

/**
 * Resumo da Entrada (§5.2 "Confira antes de finalizar"). `detalhado` mostra também a resposta de cada pergunta
 * das teses: é o que o gestor vê para decidir um pedido de correção (§6.2). Não tem números calculados.
 */
export function ResumoEntrada({ entrada: bruta, detalhado = false }: { entrada: Record<string, unknown>; detalhado?: boolean }) {
  const entrada = bruta as Entrada;
  const ctx: CtxPergunta = { saida: entrada.saida, local: entrada.local, meses: entrada.meses, testemunha: entrada.testemunha, teses: entrada.teses ?? [] };
  const extras = PASSO_SAIDA
    .filter((p) => !['saida', 'local', 'testemunha'].includes(p.campo as string) && entrada[p.campo as string] !== undefined)
    .map((p) => {
      const v = entrada[p.campo as string];
      const op = (p.opcoes ?? []).find(([k]) => k === (typeof v === 'boolean' ? (v ? 'sim' : 'nao') : v));
      return `${p.rotulo} ${op?.[1] ?? simNao(v)}`;
    });
  const teses = entrada.teses ?? [];

  return (
    <div className="space-y-4">
      <section className="divide-y rounded-md border px-3">
        {linha('Salário', formatarBRL(Number(entrada.salario)))}
        {linha('Meses de vínculo', String(entrada.meses))}
        {linha('Funcionários', String(entrada.funcionarios))}
        {linha('Dias por semana', String(entrada.diasSemana))}
      </section>
      <section className="divide-y rounded-md border px-3">
        {linha('Saída', Object.fromEntries(SAIDAS)[entrada.saida as string] ?? String(entrada.saida))}
        {extras.map((x) => <p key={x} className="py-1.5 text-sm">{x}</p>)}
        {linha('Trabalho', entrada.local === 'externo' ? 'Externo' : 'Interno')}
        {linha('Testemunha', simNao(entrada.testemunha))}
      </section>
      {detalhado ? teses.map((t) => {
        const r = entrada.respostas?.[t] ?? {};
        return (
          <section key={t} className="rounded-md border px-3 py-2">
            <p className="pb-1 text-sm font-semibold">{NOME_TESE[t]}</p>
            <div className="divide-y">
              {PERGUNTAS[t].filter((p) => p.id in r).map((p) => {
                const rotulo = typeof p.rotulo === 'function' ? p.rotulo(r as never, ctx) : p.rotulo;
                const opcoes = (typeof p.opcoes === 'function' ? p.opcoes(r as never, ctx, undefined as never) : p.opcoes) ?? [];
                return (
                  <div key={p.id} className="py-1.5 text-sm">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <span className="block font-medium">{valorLegivel(opcoes, r[p.id])}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      }) : (
        <section className="rounded-md border p-3">
          <p className="mb-1 text-sm text-muted-foreground">Teses</p>
          <p className="text-sm font-medium">{teses.map((t) => NOME_TESE[t]).join(' · ')}</p>
        </section>
      )}
    </div>
  );
}
