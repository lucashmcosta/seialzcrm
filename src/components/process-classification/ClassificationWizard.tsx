import { useMemo, useRef, useState } from 'react';
import { SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Escolha, Multipla, Numero, Rotulo } from './Campos';
import { ClassificationReveal } from './ClassificationReveal';
import { ClassificationApiError, useClassify, type Classificacao } from './api';
import { NOME_TESE, PASSO_DADOS, SAIDAS, TITULOS_PASSO, type Pergunta, type TeseId } from './perguntas';
import {
  TESES, alternarTese, contexto, errosDados, escolherSaida, montarEntrada, pendencia, rascunhoInicial, responder,
  telaDaTese, topoVisivel, type Rascunho,
} from './rascunho';
import { formatarBRL } from './formato';

type Passo = { tipo: 'dados' } | { tipo: 'saida' } | { tipo: 'teses' } | { tipo: 'tese'; tese: TeseId } | { tipo: 'revisao' };
type Fase = 'preenchendo' | 'analisando' | 'resultado';

const ANALISE_MIN_MS = 1500;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const novaChave = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const rotuloDe = (p: Pergunta, r: Record<string, unknown>, c: ReturnType<typeof contexto>) =>
  typeof p.rotulo === 'function' ? p.rotulo(r as never, c) : p.rotulo;
const opcoesDe = (p: Pergunta, r: Record<string, unknown>, c: ReturnType<typeof contexto>) =>
  (typeof p.opcoes === 'function' ? p.opcoes(r as never, c, undefined as never) : p.opcoes) ?? [];

/** Assistente do vendedor (§5.2) + "Analisando…" + revelação (§5.4). */
export function ClassificationWizard({ opportunityId, onDone }: { opportunityId: string; onDone: () => void }) {
  const [r, setR] = useState<Rascunho>(rascunhoInicial);
  const [i, setI] = useState(0);
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [fase, setFase] = useState<Fase>('preenchendo');
  const [erro, setErro] = useState<{ mensagem: string; pendencias?: { tese: TeseId; aviso: string }[] } | null>(null);
  const [resultado, setResultado] = useState<Classificacao | null>(null);
  const chave = useRef(novaChave());
  const classify = useClassify(opportunityId);

  const passos: Passo[] = useMemo(() => [
    { tipo: 'dados' }, { tipo: 'saida' }, { tipo: 'teses' },
    ...r.teses.map((tese) => ({ tipo: 'tese' as const, tese })), { tipo: 'revisao' },
  ], [r.teses]);
  const passo = passos[Math.min(i, passos.length - 1)];
  const ctx = contexto(r);

  const bloqueio = (() => {
    if (passo.tipo === 'dados') return Object.values(errosDados(r))[0] ?? '';
    if (passo.tipo === 'teses') return r.teses.length === 0 ? 'Marque pelo menos uma tese.' : '';
    if (passo.tipo === 'tese') return pendencia(r, passo.tese);
    return '';
  })();

  const avancar = () => {
    if (bloqueio) { setTentouAvancar(true); return; }
    setTentouAvancar(false);
    setI((x) => Math.min(x + 1, passos.length - 1));
  };
  const voltar = () => { setTentouAvancar(false); setErro(null); setI((x) => Math.max(0, x - 1)); };

  const finalizar = async () => {
    setErro(null);
    setFase('analisando');
    try {
      const [res] = await Promise.all([classify.mutateAsync({ entrada: montarEntrada(r), idempotencyKey: chave.current }), espera(ANALISE_MIN_MS)]);
      setResultado(res);
      setFase('resultado');
    } catch (e) {
      await espera(300);
      const api = e instanceof ClassificationApiError ? e : null;
      setErro({ mensagem: api?.message ?? 'Não foi possível finalizar. Tente de novo.', pendencias: api?.extra?.pendencias as never });
      setFase('preenchendo');
    }
  };

  if (fase === 'analisando') {
    return (
      <div className="grid place-items-center gap-3 py-16 text-sm text-muted-foreground" role="status" aria-live="polite">
        <SpinnerGap className="h-10 w-10 animate-spin text-primary motion-reduce:animate-none" />
        Analisando o caso…
      </div>
    );
  }
  if (fase === 'resultado' && resultado) {
    return (
      <div className="space-y-6 py-4">
        {resultado.emRevisao || !resultado.faixa ? (
          <EmRevisao />
        ) : (
          <ClassificationReveal faixa={resultado.faixa} comissao={resultado.comissao} classificadoEm={resultado.classificadoEm}
            opportunityId={opportunityId} animar />
        )}
        <Button className="w-full" variant="outline" onClick={onDone}>Fechar</Button>
      </div>
    );
  }

  const [titulo, subtitulo] = passo.tipo === 'tese' ? [NOME_TESE[passo.tese], TITULOS_PASSO.tese[1]] : TITULOS_PASSO[passo.tipo];
  const ultimo = passo.tipo === 'revisao';

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 pb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Passo {i + 1} de {passos.length}</span>
        </div>
        <Progress value={((i + 1) / passos.length) * 100} className="h-1.5" />
        <div className="pt-2">
          <h3 className="text-lg font-semibold">{titulo}</h3>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
      </div>

      <div className="-mx-1 flex-1 space-y-5 overflow-y-auto px-1 pb-4">
        {passo.tipo === 'dados' && <PassoDados r={r} setR={setR} mostrarErros={tentouAvancar} />}
        {passo.tipo === 'saida' && <PassoSaida r={r} setR={setR} />}
        {passo.tipo === 'teses' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {TESES.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <Checkbox checked={r.teses.includes(t)} onCheckedChange={() => setR((x) => alternarTese(x, t))} />
                {NOME_TESE[t]}
              </label>
            ))}
          </div>
        )}
        {passo.tipo === 'tese' && <PassoTese r={r} setR={setR} tese={passo.tese} ctx={ctx} />}
        {passo.tipo === 'revisao' && <Revisao r={r} />}

        {/* no passo 1 o erro já aparece embaixo de cada campo */}
        {bloqueio && passo.tipo !== 'dados' && (tentouAvancar || passo.tipo === 'tese') && (
          <p className="text-sm text-destructive" role="alert">{bloqueio}</p>
        )}
      </div>

      {/* fora da área rolável: o vendedor sempre vê por que não finalizou */}
      {erro && (
        <Alert variant="destructive" className="mb-3">
          <WarningCircle className="h-4 w-4" />
          <AlertDescription>
            {erro.mensagem}
            {erro.pendencias?.length ? (
              <ul className="mt-1 list-disc pl-5">{erro.pendencias.map((p) => <li key={p.tese}>{NOME_TESE[p.tese]}</li>)}</ul>
            ) : null}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2 border-t pt-4">
        <Button variant="outline" onClick={voltar} disabled={i === 0} className="flex-1">Voltar</Button>
        {ultimo
          ? <Button onClick={finalizar} className="flex-1">Finalizar</Button>
          : <Button onClick={avancar} className="flex-1" aria-disabled={!!bloqueio}>Próximo</Button>}
      </div>
    </div>
  );
}

export function EmRevisao() {
  return (
    <div className="space-y-1 py-6 text-center">
      <p className="text-base font-semibold">Este processo vai para revisão do jurídico</p>
      <p className="text-sm text-muted-foreground">A comissão é definida depois da revisão.</p>
    </div>
  );
}

function PassoDados({ r, setR, mostrarErros }: { r: Rascunho; setR: (f: (x: Rascunho) => Rascunho) => void; mostrarErros: boolean }) {
  const erros = errosDados(r);
  return (
    <>
      {PASSO_DADOS.map((p) => {
        const campo = p.campo as string;
        const id = `pc-${campo}`;
        return (
          <div key={campo} className="space-y-1.5">
            <Rotulo id={id} rotulo={p.rotulo} dica={p.dica === 'R$' ? undefined : p.dica} />
            <Numero id={id} valor={r.topo[campo]} prefixo={p.dica === 'R$' ? 'R$' : undefined}
              erro={mostrarErros ? erros[campo] : undefined}
              onChange={(v) => setR((x) => ({ ...x, topo: { ...x.topo, [campo]: v === undefined ? undefined : String(v) } }))} />
          </div>
        );
      })}
    </>
  );
}

function PassoSaida({ r, setR }: { r: Rascunho; setR: (f: (x: Rascunho) => Rascunho) => void }) {
  return (
    <>
      {topoVisivel(r).map((p) => {
        const campo = p.campo as string;
        return (
          <div key={campo} className="space-y-2">
            <Rotulo rotulo={p.rotulo} dica={p.dica} />
            <Escolha rotulo={p.rotulo} valor={r.topo[campo]} opcoes={p.opcoes ?? []}
              onChange={(v) => setR((x) => (campo === 'saida' ? escolherSaida(x, v) : { ...x, topo: { ...x.topo, [campo]: v } }))} />
            {p.nota && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{p.nota}</p>}
          </div>
        );
      })}
    </>
  );
}

function PassoTese({ r, setR, tese, ctx }: { r: Rascunho; setR: (f: (x: Rascunho) => Rascunho) => void; tese: TeseId; ctx: ReturnType<typeof contexto> }) {
  const tela = telaDaTese(r, tese);
  return (
    <>
      {tela.perguntas.map((p) => {
        const id = `pc-${tese}-${p.id}`;
        const rotulo = rotuloDe(p, tela.valores, ctx);
        const v = tela.valores[p.id];
        const set = (nv: unknown) => setR((x) => responder(x, tese, p.id, nv as never));
        return (
          <div key={p.id} className="space-y-2">
            <Rotulo id={p.tipo === 'num' ? id : undefined} rotulo={rotulo} />
            {p.tipo === 'num' && <Numero id={id} valor={(r.respostas[tese]?.[p.id] as never) ?? (v as number)} onChange={set} />}
            {(p.tipo === 'chip' || p.tipo === 'select') && <Escolha rotulo={rotulo} valor={v as string} opcoes={opcoesDe(p, tela.valores, ctx)} onChange={set} />}
            {p.tipo === 'multi' && <Multipla rotulo={rotulo} valor={(v as string[]) ?? []} opcoes={opcoesDe(p, tela.valores, ctx)} onChange={set} />}
          </div>
        );
      })}
    </>
  );
}

function Revisao({ r }: { r: Rascunho }) {
  const e = montarEntrada(r);
  const nomeSaida = Object.fromEntries(SAIDAS)[e.saida as string];
  const extras: string[] = [];
  for (const p of topoVisivel(r)) {
    const campo = p.campo as string;
    if (['saida', 'local', 'testemunha'].includes(campo)) continue;
    const op = (p.opcoes ?? []).find(([v]) => v === r.topo[campo]);
    if (op) extras.push(`${p.rotulo} ${op[1]}`);
  }
  const linha = (t: string, v: string) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-muted-foreground">{t}</span><span className="text-right font-medium">{v}</span></div>
  );
  return (
    <div className="space-y-4">
      <section className="divide-y rounded-md border px-3">
        {linha('Salário', formatarBRL(e.salario as number))}
        {linha('Meses de vínculo', String(e.meses))}
        {linha('Funcionários', String(e.funcionarios))}
        {linha('Dias por semana', String(e.diasSemana))}
      </section>
      <section className="divide-y rounded-md border px-3">
        {linha('Saída', nomeSaida)}
        {extras.map((x) => <p key={x} className="py-1.5 text-sm">{x}</p>)}
        {linha('Trabalho', e.local === 'externo' ? 'Externo' : 'Interno')}
        {linha('Testemunha', e.testemunha ? 'Sim' : 'Não')}
      </section>
      <section className="rounded-md border p-3">
        <p className="mb-1 text-sm text-muted-foreground">Teses</p>
        <p className="text-sm font-medium">{(e.teses as TeseId[]).map((t) => NOME_TESE[t]).join(' · ')}</p>
      </section>
      <p className="rounded-md bg-muted p-3 text-sm">Depois de finalizar, a classificação fica registrada e não dá para alterar. Confira antes.</p>
    </div>
  );
}
