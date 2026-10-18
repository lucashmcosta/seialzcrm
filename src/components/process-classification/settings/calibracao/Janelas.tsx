import { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ClassificationWizard } from '../../ClassificationWizard';
import { NOME_TESE } from '../../perguntas';
import { dataHora, formatarBRL, NOME_FAIXA } from '../../formato';
import { CalibracaoApiError, callAdmin, type Mudanca, type Versao } from './api';
import { baixar, type Calibracao } from './editor';

const nomeFaixa = (f: string | null | undefined) => (f ? NOME_FAIXA[f as keyof typeof NOME_FAIXA] ?? f : '—');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const erroDe = (e: unknown) => (e instanceof CalibracaoApiError ? e.message : 'Não foi possível concluir. Tente de novo.');

/* eslint-disable @typescript-eslint/no-explicit-any -- ResultadoCaso vem do servidor (tipos completos em packages/motor-classificacao/src/tipos.ts) */

/** Simulador (§8.1): mesmas perguntas do vendedor; mostra tudo, calculado com o rascunho, no servidor. */
export function Simulador({ organizationId, conteudo, aberto, onFechar }: { organizationId: string; conteudo: Calibracao; aberto: boolean; onFechar: () => void }) {
  const [resultado, setResultado] = useState<any>(null);
  const [rodada, setRodada] = useState(0);
  const simular = async (entrada: Record<string, unknown>) => {
    try {
      const r = await callAdmin<{ resultado: any }>(organizationId, 'simulate', { entrada, content: conteudo });
      setResultado(r.resultado);
    } catch (e) { toast({ variant: 'destructive', description: erroDe(e) }); }
  };
  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) { setResultado(null); onFechar(); } }}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Simular um caso</SheetTitle>
          <SheetDescription>Calculado com a calibração em edição (rascunho), sem gravar nada.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {resultado ? (
            <div className="space-y-4">
              <ResultadoCompleto resultado={resultado} />
              <Button variant="outline" onClick={() => { setResultado(null); setRodada((x) => x + 1); }}>Simular outro caso</Button>
            </div>
          ) : (
            aberto && <ClassificationWizard key={rodada} opportunityId="simulacao" onDone={onFechar} onSimular={simular} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Resultado completo do motor (só para quem vê os números): totais e, por tese, chance, valor, esperado, selo e detalhe. */
export function ResultadoCompleto({ resultado }: { resultado: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Kpi rotulo="Faixa" valor={resultado.emRevisao ? 'Revisão' : nomeFaixa(resultado.faixa)} />
        <Kpi rotulo="Comissão" valor={formatarBRL(resultado.comissao)} />
        <Kpi rotulo="Score" valor={`${resultado.score}`} />
        <Kpi rotulo="Faixa por valor" valor={nomeFaixa(resultado.faixaPorValor)} />
        <Kpi rotulo="Bruto total" valor={formatarBRL(resultado.brutoTotal)} />
        <Kpi rotulo="Esperado total" valor={formatarBRL(resultado.esperadoTotal)} />
        <Kpi rotulo="Valor composto" valor={formatarBRL(resultado.valorComposto)} />
        <Kpi rotulo="Ajuste do score" valor={resultado.ajusteScore ? `${resultado.ajusteScore.mover >= 0 ? '+' : ''}${resultado.ajusteScore.mover} · ${resultado.ajusteScore.pct}%` : '—'} />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Tese</th><th className="p-2">Chance</th><th className="p-2">Valor</th><th className="p-2">Esperado</th><th className="p-2">Selo</th></tr></thead>
          <tbody>
            {resultado.teses.map((t: any) => (
              <tr key={t.tese} className="border-b align-top last:border-0">
                <td className="p-2">
                  <span className="font-medium">{NOME_TESE[t.tese as keyof typeof NOME_TESE]}</span>
                  {t.excluida && <span className="ml-1 text-xs text-muted-foreground">(excluída)</span>}
                  {t.aviso && <span className="block text-xs text-destructive">{t.aviso}</span>}
                  <span className="block text-xs text-muted-foreground">{t.detalhe}</span>
                </td>
                <td className="p-2 tabular-nums">{pct(t.prob)}</td>
                <td className="p-2 tabular-nums">{formatarBRL(t.bruto)}</td>
                <td className="p-2 tabular-nums">{formatarBRL(t.esperado)}</td>
                <td className="p-2">{t.selo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="font-semibold tabular-nums">{valor}</p></div>;
}

/** Prévia de impacto (§8.3): recalcula com o rascunho as classificações ativas dos últimos N dias. Não grava. */
export function PreviaImpacto({ organizationId, conteudo, aberto, onFechar }: { organizationId: string; conteudo: Calibracao; aberto: boolean; onFechar: () => void }) {
  const [dias, setDias] = useState(90);
  const [r, setR] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const rodar = async () => {
    setCarregando(true);
    try { setR(await callAdmin(organizationId, 'impact_preview', { content: conteudo, days: dias })); }
    catch (e) { toast({ variant: 'destructive', description: erroDe(e) }); }
    finally { setCarregando(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aberto) void rodar(); }, [aberto]);
  const FX = ['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'];
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) { setR(null); onFechar(); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévia de impacto</DialogTitle>
          <DialogDescription>Como ficariam as classificações ativas se o rascunho fosse publicado. É só uma simulação: as classificações não mudam.</DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><p className="text-xs text-muted-foreground">Últimos dias</p>
            <Input type="number" min={1} max={365} value={dias} onChange={(e) => setDias(Number(e.target.value) || 90)} className="w-24" /></div>
          <Button variant="outline" onClick={rodar} disabled={carregando}>{carregando && <SpinnerGap className="mr-1.5 h-4 w-4 animate-spin" />}Recalcular</Button>
        </div>
        {!r ? <p className="py-6 text-sm text-muted-foreground">Calculando…</p> : r.casos === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhuma classificação ativa no período.</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi rotulo="Casos" valor={String(r.casos)} />
              <Kpi rotulo="Sobem / descem / ficam" valor={`${r.sobem} / ${r.descem} / ${r.ficam}`} />
              <Kpi rotulo="Comissão total atual" valor={formatarBRL(r.totalAtual)} />
              <Kpi rotulo="Comissão total nova" valor={`${formatarBRL(r.totalNova)} (${r.totalNova - r.totalAtual >= 0 ? '+' : ''}${formatarBRL(r.totalNova - r.totalAtual)})`} />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left">Atual \ Nova</th>{FX.map((f) => <th key={f} className="p-2">{nomeFaixa(f)}</th>)}</tr></thead>
                <tbody>{r.matriz.map((linha: number[], i: number) => (
                  <tr key={i} className="border-b last:border-0"><th className="p-2 text-left">{nomeFaixa(FX[i])}</th>
                    {linha.map((n, j) => <td key={j} className={i === j ? 'p-2 text-center text-muted-foreground' : 'p-2 text-center font-semibold'}>{n}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Diferença por vendedor</p>
              <div className="rounded-md border divide-y text-sm">
                {r.porVendedor.map((v: any) => (
                  <div key={v.sellerId} className="flex justify-between gap-2 p-2">
                    <span>{v.nome} <span className="text-xs text-muted-foreground">({v.casos} casos)</span></span>
                    <span className="tabular-nums">{formatarBRL(v.atual)} → {formatarBRL(v.nova)} <strong className={v.diferenca < 0 ? 'text-destructive' : ''}>({v.diferenca >= 0 ? '+' : ''}{formatarBRL(v.diferenca)})</strong></span>
                  </div>
                ))}
              </div>
            </div>
            {r.maioresMudancas.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Casos que mais mudam</p>
                <div className="rounded-md border divide-y text-sm">
                  {r.maioresMudancas.map((m: any) => (
                    <div key={m.classificationId} className="flex justify-between gap-2 p-2">
                      <a href={`/opportunities/${m.opportunityId}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">Oportunidade #{m.opportunityId.slice(0, 8).toUpperCase()}</a>
                      <span className="tabular-nums">{nomeFaixa(m.de.faixa)} {formatarBRL(m.de.comissao)} → {nomeFaixa(m.para.faixa)} {formatarBRL(m.para.comissao)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ListaMudancas({ mudancas }: { mudancas: Mudanca[] }) {
  if (!mudancas.length) return <p className="text-sm text-muted-foreground">Nenhuma mudança.</p>;
  const v = (x: unknown) => (typeof x === 'number' ? x.toLocaleString('pt-BR') : JSON.stringify(x));
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border divide-y text-sm">
      {mudancas.map((m) => (
        <div key={m.caminho} className="flex justify-between gap-3 p-2">
          <span>{m.rotulo}</span><span className="whitespace-nowrap tabular-nums">{v(m.antes)} → <strong>{v(m.depois)}</strong></span>
        </div>
      ))}
    </div>
  );
}

/** Publicar (§8.2): conferência (bloqueia), o que mudou, nota obrigatória. O servidor confere de novo. */
export function Publicar({ aberto, onFechar, problemas, mudancas, onPublicar }: {
  aberto: boolean; onFechar: () => void; problemas: string[]; mudancas: Mudanca[]; onPublicar: (nota: string) => Promise<void>;
}) {
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bloqueado = problemas.length > 0 || mudancas.length === 0;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publicar calibração</DialogTitle>
          <DialogDescription>Vira uma versão nova que não muda mais. Classificações já feitas mantêm a versão e a comissão que tiveram; só as próximas usam esta.</DialogDescription>
        </DialogHeader>
        {problemas.length > 0 && (
          <Alert variant="destructive"><AlertDescription>
            <p className="font-medium">Corrija antes de publicar:</p>
            <ul className="mt-1 list-disc pl-5">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
          </AlertDescription></Alert>
        )}
        <div className="space-y-1"><p className="text-sm font-medium">O que muda ({mudancas.length})</p><ListaMudancas mudancas={mudancas} /></div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Nota da publicação</p>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} placeholder="Ex.: ajuste das chances de horas extras validado com o Renan." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          <Button disabled={bloqueado || !nota.trim() || enviando}
            onClick={async () => { setEnviando(true); try { await onPublicar(nota.trim()); setNota(''); } finally { setEnviando(false); } }}>
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Histórico (§8.2): versões, o que mudou em cada uma, exportar e restaurar (vira rascunho). */
export function Historico({ organizationId, versoes, podeRestaurar, onRestaurar }: {
  organizationId: string; versoes: Versao[]; podeRestaurar: boolean; onRestaurar: (id: string) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [mudancas, setMudancas] = useState<Mudanca[] | null>(null);
  const abrir = async (id: string) => {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id); setMudancas(null);
    try { setMudancas((await callAdmin<{ mudancas: Mudanca[] }>(organizationId, 'version_diff', { version_id: id })).mudancas); }
    catch (e) { toast({ variant: 'destructive', description: erroDe(e) }); }
  };
  return (
    <div className="rounded-md border divide-y">
      {versoes.map((v) => (
        <div key={v.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">v{v.numero}</span>{' '}
              <span className={v.status === 'published' ? 'rounded-full bg-success/15 px-2 text-xs' : 'rounded-full bg-muted px-2 text-xs'}>{v.status === 'published' ? 'em uso' : 'arquivada'}</span>
              <p className="text-xs text-muted-foreground">{v.publicadaEm ? dataHora(v.publicadaEm) : '—'}{v.publicadaPor ? ` · ${v.publicadaPor}` : ''}</p>
              {v.nota && <p className="text-sm">{v.nota}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => abrir(v.id)}>{aberta === v.id ? 'Fechar' : 'O que mudou'}</Button>
              <Button size="sm" variant="ghost" onClick={() => baixar(v.conteudo, v.numero)}>Exportar</Button>
              {podeRestaurar && v.status !== 'published' && <Button size="sm" variant="outline" onClick={() => onRestaurar(v.id)}>Restaurar</Button>}
            </div>
          </div>
          {aberta === v.id && <div className="mt-2">{mudancas ? <ListaMudancas mudancas={mudancas} /> : <p className="text-xs text-muted-foreground">Carregando…</p>}</div>}
        </div>
      ))}
    </div>
  );
}


