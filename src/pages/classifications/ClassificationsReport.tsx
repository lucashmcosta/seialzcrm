import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DownloadSimple, Scales, SpinnerGap } from '@phosphor-icons/react';
import { Layout } from '@/components/Layout';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { baixarCsv, gerarCsv } from '@/components/process-classification/csv';
import { dataHora, formatarBRL, NOME_FAIXA } from '@/components/process-classification/formato';
import { ResumoEntrada } from '@/components/process-classification/ResumoEntrada';
import { ResultadoCompleto } from '@/components/process-classification/settings/calibracao/Janelas';
import { useProcessClassificationEnabled } from '@/components/process-classification/useProcessClassificationEnabled';

/* eslint-disable @typescript-eslint/no-explicit-any -- respostas das RPCs pc_report* (supabase/migrations/20261018210000_process_classification_reports.sql) */

const FAIXAS = ['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'] as const;
const nomeFaixa = (f: string | null | undefined) => (f ? NOME_FAIXA[f as keyof typeof NOME_FAIXA] ?? f : 'Revisão');
const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const POR_PAGINA = 50;

interface Filtros { de: string; ate: string; vendedor: string; faixa: string; versao: string; emRevisao: boolean; incluirAntigas: boolean }

function argumentos(org: string, f: Filtros) {
  return {
    _org: org, _from: `${f.de}T00:00:00`, _to: new Date(new Date(`${f.ate}T00:00:00`).getTime() + 86400_000).toISOString(),
    _seller: f.vendedor || null, _band: f.faixa || null, _version: f.versao ? Number(f.versao) : null,
    _in_review: f.emRevisao ? true : null, _statuses: f.incluirAntigas ? ['active', 'superseded', 'voided'] : ['active'],
  };
}

/** Relatório de classificações (SPEC §8.4): filtros, detalhe por permissão e CSV (por tese, com números). */
export default function ClassificationsReport() {
  const { organization } = useOrganization();
  const moduloLigado = useProcessClassificationEnabled();
  const isMobile = useIsMobile();
  const org = organization?.id ?? '';
  const [f, setF] = useState<Filtros>({ de: diasAtras(30), ate: hoje(), vendedor: '', faixa: '', versao: '', emRevisao: false, incluirAntigas: false });
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const set = (p: Partial<Filtros>) => { setF((x) => ({ ...x, ...p })); setPagina(0); };

  const { data, isLoading, error } = useQuery({
    queryKey: ['pc-report', org, f, pagina],
    enabled: !!org && moduloLigado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pc_report' as never, { ...argumentos(org, f), _limit: POR_PAGINA, _offset: pagina * POR_PAGINA } as never);
      if (error) throw error;
      return data as any;
    },
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const { data: r, error } = await supabase.rpc('pc_report_export' as never, argumentos(org, f) as never);
      if (error) throw error;
      const res = r as any;
      const base = [
        { chave: 'data', titulo: 'Data' }, { chave: 'classificacao_id', titulo: 'Classificação' }, { chave: 'oportunidade_id', titulo: 'Oportunidade' },
        { chave: 'vendedor', titulo: 'Vendedor' }, { chave: 'status', titulo: 'Situação' }, { chave: 'versao_calibracao', titulo: 'Versão da calibração' },
        { chave: 'versao_motor', titulo: 'Versão do motor' }, { chave: 'faixa', titulo: 'Faixa' }, { chave: 'comissao', titulo: 'Comissão' },
        { chave: 'em_revisao', titulo: 'Em revisão' }, { chave: 'certificacao', titulo: 'Certificação' },
        { chave: 'faixa_certificada', titulo: 'Faixa final' }, { chave: 'comissao_certificada', titulo: 'Comissão final' },
      ];
      const numeros = [
        { chave: 'score', titulo: 'Score' }, { chave: 'tese', titulo: 'Tese' }, { chave: 'chance', titulo: 'Chance' },
        { chave: 'chance_automatica', titulo: 'Chance automática' }, { chave: 'valor_bruto', titulo: 'Valor bruto' },
        { chave: 'valor_esperado', titulo: 'Valor esperado' }, { chave: 'selo', titulo: 'Selo' }, { chave: 'aviso', titulo: 'Aviso' },
        { chave: 'excluida', titulo: 'Excluída' },
      ];
      const csv = gerarCsv(res.numeros ? [...base, ...numeros] : base, res.linhas.map((l: any) => ({ ...l, data: dataHora(l.data) })));
      baixarCsv(`classificacoes-${f.de}-a-${f.ate}${res.numeros ? '-por-tese' : ''}.csv`, csv);
    } catch {
      toast({ variant: 'destructive', description: 'Não foi possível exportar.' });
    } finally { setExportando(false); }
  };

  const conteudo = !moduloLigado ? (
    <Alert><AlertDescription>O widget Classificação do processo não está ligado nesta organização.</AlertDescription></Alert>
  ) : (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={f.de} max={f.ate} onChange={(e) => set({ de: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={f.ate} min={f.de} onChange={(e) => set({ ate: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">Vendedor</Label>
          <NativeSelect value={f.vendedor} onChange={(e) => set({ vendedor: e.target.value })}
            options={[{ value: '', label: 'Todos' }, ...((data?.vendedores ?? []) as { id: string; nome: string }[]).map((v) => ({ value: v.id, label: v.nome }))]} /></div>
        <div className="space-y-1"><Label className="text-xs">Faixa</Label>
          <NativeSelect value={f.faixa} onChange={(e) => set({ faixa: e.target.value })}
            options={[{ value: '', label: 'Todas' }, ...FAIXAS.map((x) => ({ value: x, label: NOME_FAIXA[x] }))]} /></div>
        <div className="space-y-1"><Label className="text-xs">Versão da calibração</Label>
          <NativeSelect value={f.versao} onChange={(e) => set({ versao: e.target.value })}
            options={[{ value: '', label: 'Todas' }, ...((data?.versoes ?? []) as number[]).sort((a, b) => b - a).map((v) => ({ value: String(v), label: `v${v}` }))]} /></div>
        <div className="flex flex-col justify-end gap-1.5 text-sm">
          <label className="flex items-center gap-2"><Checkbox checked={f.emRevisao} onCheckedChange={(v) => set({ emRevisao: !!v })} />Só em revisão</label>
          <label className="flex items-center gap-2"><Checkbox checked={f.incluirAntigas} onCheckedChange={(v) => set({ incluirAntigas: !!v })} />Incluir substituídas e anuladas</label>
        </div>
      </div>

      {error ? <Alert variant="destructive"><AlertDescription>Não foi possível carregar as classificações.</AlertDescription></Alert>
        : isLoading || !data ? <Skeleton className="h-64 w-full" /> : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Resumo rotulo="Classificações" valor={String(data.total)} />
            <Resumo rotulo="Comissão (ativas)" valor={formatarBRL(Number(data.comissaoTotal))} />
            {[...FAIXAS, 'REVISAO'].map((x) => <Resumo key={x} rotulo={nomeFaixa(x === 'REVISAO' ? null : x)} valor={String(data.porFaixa?.[x] ?? 0)} cor={x !== 'REVISAO' ? `hsl(var(--band-${x.toLowerCase()}))` : undefined} />)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{data.numeros ? 'Você vê os números do caso (score e, na exportação, chance e valor por tese).' : 'Chances e valores ficam com o jurídico.'}</p>
            <Button size="sm" variant="outline" onClick={exportar} disabled={exportando || !data.total} title="CSV para Excel (pt-BR)">
              {exportando ? <SpinnerGap className="mr-1.5 h-4 w-4 animate-spin" /> : <DownloadSimple className="mr-1.5 h-4 w-4" />}Exportar CSV
            </Button>
          </div>

          {data.total === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma classificação no período.</p> : isMobile ? (
            <div className="space-y-2">
              {data.linhas.map((l: any) => (
                <button key={l.id} className="w-full rounded-md border bg-card p-3 text-left text-sm" onClick={() => setAberta(l.id)}>
                  <div className="flex justify-between gap-2"><span className="font-medium">{l.oportunidade ?? 'Oportunidade'}</span><FaixaTag faixa={l.faixa} /></div>
                  <p className="text-xs text-muted-foreground">{l.vendedor} · {dataHora(l.criadoEm)} · v{l.versao}</p>
                  <p className="mt-1">{formatarBRL(Number(l.certificacao?.comissao ?? l.comissao))}{l.certificacao?.resultado === 'reduced' && <span className="ml-1 text-xs text-destructive">(ajustada)</span>}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-2">Data</th><th className="p-2">Oportunidade</th><th className="p-2">Vendedor</th><th className="p-2">Faixa</th>
                  <th className="p-2 text-right">Comissão</th>{data.numeros && <th className="p-2 text-right">Score</th>}<th className="p-2">Versão</th><th className="p-2">Situação</th>
                </tr></thead>
                <tbody>
                  {data.linhas.map((l: any) => (
                    <tr key={l.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => setAberta(l.id)}>
                      <td className="p-2 whitespace-nowrap">{dataHora(l.criadoEm)}</td>
                      <td className="p-2"><Link to={`/opportunities/${l.oportunidadeId}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{l.oportunidade ?? '—'}</Link></td>
                      <td className="p-2">{l.vendedor}</td>
                      <td className="p-2"><FaixaTag faixa={l.faixa} /></td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">
                        {l.certificacao?.resultado === 'reduced'
                          ? <><s className="text-muted-foreground">{formatarBRL(Number(l.comissao))}</s> {formatarBRL(Number(l.certificacao.comissao))}</>
                          : formatarBRL(Number(l.comissao))}
                      </td>
                      {data.numeros && <td className="p-2 text-right tabular-nums">{l.score ?? '—'}</td>}
                      <td className="p-2">v{l.versao}</td>
                      <td className="p-2 space-x-1">
                        {l.status !== 'active' && <Badge variant="outline">{l.status === 'superseded' ? 'substituída' : 'anulada'}</Badge>}
                        {l.emRevisao && <Badge variant="outline">em revisão</Badge>}
                        {l.certificacao && <Badge variant={l.certificacao.resultado === 'reduced' ? 'destructive' : 'secondary'}>{l.certificacao.resultado === 'reduced' ? 'ajustada' : 'certificada'}</Badge>}
                        {l.correcoes > 0 && <Badge variant="outline">{l.correcoes} correç{l.correcoes === 1 ? 'ão' : 'ões'}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.total > POR_PAGINA && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">{pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, data.total)} de {data.total}</span>
              <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={(pagina + 1) * POR_PAGINA >= data.total} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
            </div>
          )}
        </>
      )}
      <Detalhe id={aberta} onFechar={() => setAberta(null)} />
    </div>
  );

  const pagina_ = (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10"><Scales size={22} weight="duotone" className="text-primary" /></div>
        <div><h1 className="text-2xl font-bold text-foreground">Classificações de processos</h1>
          <p className="text-sm text-muted-foreground">Faixa e comissão de cada venda, com correções e certificações.</p></div>
      </div>
      {conteudo}
    </div>
  );
  return isMobile ? <MobileLayout>{pagina_}</MobileLayout> : <Layout>{pagina_}</Layout>;
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return <div className="rounded-md border bg-card p-2"><p className="text-xs text-muted-foreground" style={cor ? { color: cor } : undefined}>{rotulo}</p><p className="text-lg font-semibold tabular-nums">{valor}</p></div>;
}

function FaixaTag({ faixa }: { faixa: string | null }) {
  return <span className="font-medium" style={faixa ? { color: `hsl(var(--band-${faixa.toLowerCase()}))` } : undefined}>{nomeFaixa(faixa)}</span>;
}

/** Detalhe: respostas, correções, certificação; resultado completo só para quem vê os números. */
function Detalhe({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pc-report-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pc_report_detail' as never, { _id: id } as never);
      if (error) throw error;
      return data as any;
    },
  });
  const correcoes = useMemo(() => (data?.correcoes ?? []) as any[], [data]);
  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Classificação</SheetTitle><SheetDescription>{data ? dataHora(data.criadoEm) : ''}</SheetDescription></SheetHeader>
        {isLoading || !data ? <Skeleton className="mt-4 h-64 w-full" /> : (
          <div className="mt-4 space-y-5">
            <p className="text-sm">Faixa <FaixaTag faixa={data.faixa} /> · Comissão {formatarBRL(Number(data.comissao))}</p>
            {data.certificacao && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{data.certificacao.resultado === 'reduced' ? 'Ajustada na certificação' : 'Certificada (confirmada)'}</p>
                {data.certificacao.resultado === 'reduced' && <p>{nomeFaixa(data.certificacao.original.faixa)} {formatarBRL(Number(data.certificacao.original.comissao))} → {nomeFaixa(data.certificacao.final.faixa)} {formatarBRL(Number(data.certificacao.final.comissao))}</p>}
                <p className="text-muted-foreground">{data.certificacao.motivo}</p>
              </div>
            )}
            {correcoes.length > 0 && (
              <div className="space-y-1 text-sm"><p className="font-medium">Pedidos de correção</p>
                {correcoes.map((c, i) => <p key={i} className="text-muted-foreground">{dataHora(c.criadoEm)} · {c.status === 'pending' ? 'pendente' : c.status === 'released' ? 'liberado' : 'recusado'}{c.motivo ? ` — ${c.motivo}` : ''}</p>)}
              </div>
            )}
            {data.resultado && <div className="space-y-2"><p className="text-sm font-medium">Números do caso</p><ResultadoCompleto resultado={data.resultado} /></div>}
            <div className="space-y-2"><p className="text-sm font-medium">Respostas do vendedor</p><ResumoEntrada entrada={data.entrada} detalhado /></div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
