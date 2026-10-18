import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, DotsThreeVertical, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { dataHora } from '../../formato';
import { CalibracaoApiError, callAdmin, useRecarregarWorkspace, useWorkspace, type Conferencia } from './api';
import { baixar, gravar, type Calibracao, type Caminho } from './editor';
import { Historico, PreviaImpacto, Publicar, Simulador } from './Janelas';
import { SecaoFaixas, SecaoGeral, SecaoTeses } from './Secoes';

type Salvo = 'salvo' | 'pendente' | 'salvando' | 'conflito' | 'erro';
const erroDe = (e: unknown) => (e instanceof CalibracaoApiError ? e.message : 'Não foi possível concluir. Tente de novo.');

/**
 * Aba Calibração (Fase 4, SPEC §8): editor com rascunho salvo sozinho, conferência e matriz ao vivo, simulador,
 * prévia de impacto, publicar com nota, histórico, importar/exportar e restaurar. Tudo calculado no servidor.
 */
export function CalibracaoTab({ organizationId }: { organizationId: string }) {
  const { data: ws, isLoading, error } = useWorkspace(organizationId);
  const recarregar = useRecarregarWorkspace(organizationId);
  const [conteudo, setConteudo] = useState<Calibracao | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [numeroRascunho, setNumeroRascunho] = useState<number | null>(null);
  const [salvo, setSalvo] = useState<Salvo>('salvo');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [janela, setJanela] = useState<null | 'simular' | 'impacto' | 'publicar' | 'descartar' | 'padrao'>(null);
  const timer = useRef<number>();
  const arquivo = useRef<HTMLInputElement>(null);
  const conteudoRef = useRef<Calibracao | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Carrega do servidor: rascunho (se houver) ou a publicada.
  useEffect(() => {
    if (!ws) return;
    const c = ws.rascunho?.conteudo ?? ws.publicada?.conteudo ?? null;
    setConteudo(c); conteudoRef.current = c;
    setToken(ws.rascunho?.atualizadoEm ?? null); tokenRef.current = ws.rascunho?.atualizadoEm ?? null;
    setNumeroRascunho(ws.rascunho?.numero ?? null);
    setSalvo('salvo');
  }, [ws]);

  const salvar = useCallback(async () => {
    if (!conteudoRef.current) return;
    setSalvo('salvando');
    try {
      const r = await callAdmin<{ numero: number; atualizadoEm: string }>(organizationId, 'save_draft', { content: conteudoRef.current, expected_updated_at: tokenRef.current });
      tokenRef.current = r.atualizadoEm; setToken(r.atualizadoEm); setNumeroRascunho(r.numero);
      setSalvo('salvo'); setSalvoEm(new Date().toISOString());
    } catch (e) {
      setSalvo(e instanceof CalibracaoApiError && e.code === 'draft_conflict' ? 'conflito' : 'erro');
    }
  }, [organizationId]);

  // Conferência + matriz no servidor a cada mudança (sem precisar salvar).
  useEffect(() => {
    if (!conteudo) return;
    const t = window.setTimeout(() => {
      callAdmin<Conferencia>(organizationId, 'check', { content: conteudo }).then(setConferencia).catch(() => setConferencia(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [conteudo, organizationId]);

  const editar = (caminho: Caminho, valor: unknown) => {
    if (!conteudoRef.current || salvo === 'conflito') return;
    const novo = gravar(conteudoRef.current, caminho, valor);
    conteudoRef.current = novo; setConteudo(novo); setSalvo('pendente');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void salvar(), 800);
  };

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ description: ok }); await recarregar(); }
    catch (e) { toast({ variant: 'destructive', description: erroDe(e) }); }
  };

  if (isLoading) return <Skeleton className="mt-2 h-64 w-full" />;
  if (error || !ws) return <Alert variant="destructive" className="mt-2"><AlertDescription>{erroDe(error)}</AlertDescription></Alert>;
  if (!conteudo) return <p className="mt-2 text-sm text-muted-foreground">Nenhuma calibração ainda. Use “Restaurar padrão” para começar.</p>;

  const pode = ws.podeCalibrar && salvo !== 'conflito';
  const mudancas = conferencia?.mudancas ?? [];
  const problemas = conferencia?.problemas ?? [];
  const publicada = ws.publicada?.conteudo ?? null;

  return (
    <div className="mt-2 space-y-4">
      {/* Barra fixa: situação + ações */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3">
        <div className="text-sm">
          <p className="font-medium">
            {numeroRascunho ? `Rascunho v${numeroRascunho} · ${mudancas.length} ${mudancas.length === 1 ? 'mudança' : 'mudanças'}` : `Publicada v${ws.publicada?.numero ?? '—'} · sem rascunho`}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {salvo === 'salvando' && <><SpinnerGap className="h-3 w-3 animate-spin" /> Salvando…</>}
            {salvo === 'pendente' && 'Alterações não salvas…'}
            {salvo === 'salvo' && (numeroRascunho ? <><CheckCircle className="h-3 w-3" /> Rascunho salvo{salvoEm ? ` às ${dataHora(salvoEm).split(' às ')[1]}` : ''}</> : 'Edite um número para começar um rascunho.')}
            {salvo === 'erro' && <span className="text-destructive">Não foi possível salvar. <button className="underline" onClick={() => void salvar()}>Tentar de novo</button></span>}
          </p>
          {problemas.length > 0 && <p className="text-xs text-destructive">{problemas.length} {problemas.length === 1 ? 'problema impede' : 'problemas impedem'} publicar</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ws.podeCalibrar && <Button size="sm" variant="outline" onClick={() => setJanela('simular')}>Simular</Button>}
          {ws.podeCalibrar && <Button size="sm" variant="outline" onClick={() => setJanela('impacto')} disabled={!mudancas.length}>Prévia de impacto</Button>}
          {ws.podePublicar && <Button size="sm" onClick={() => setJanela('publicar')} disabled={!numeroRascunho || salvo !== 'salvo' || !mudancas.length}>Publicar…</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações"><DotsThreeVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => baixar(conteudo, numeroRascunho)}>Exportar (JSON do protótipo)</DropdownMenuItem>
              {ws.podeCalibrar && <DropdownMenuItem onClick={() => arquivo.current?.click()}>Importar…</DropdownMenuItem>}
              {ws.podePublicar && <DropdownMenuItem onClick={() => setJanela('padrao')}>Restaurar padrão</DropdownMenuItem>}
              {ws.podeCalibrar && numeroRascunho && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setJanela('descartar')}>Descartar rascunho</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            let json: unknown;
            try { json = JSON.parse(await f.text()); } catch { toast({ variant: 'destructive', description: 'O arquivo não é um JSON válido.' }); return; }
            try {
              const r = await callAdmin<{ aplicados: number; ignorados: string[] }>(organizationId, 'import', { content: json, expected_updated_at: tokenRef.current });
              toast({ description: `Importado no rascunho: ${r.aplicados} grupos aplicados${r.ignorados.length ? `; ignorados (não existem mais): ${r.ignorados.join(', ')}` : ''}.` });
              await recarregar();
            } catch (err) { toast({ variant: 'destructive', description: erroDe(err) }); }
          }} />
        </div>
      </div>

      {salvo === 'conflito' && (
        <Alert variant="destructive"><WarningCircle className="h-4 w-4" />
          <AlertDescription>Outra pessoa alterou a calibração enquanto você editava. <button className="underline" onClick={() => void recarregar()}>Recarregar a versão mais recente</button> (suas últimas alterações não foram salvas).</AlertDescription>
        </Alert>
      )}
      {!ws.podeCalibrar && <Alert><AlertDescription>Você pode publicar e restaurar versões, mas não editar os números.</AlertDescription></Alert>}

      <Tabs defaultValue="teses">
        <TabsList className="flex-wrap">
          <TabsTrigger value="teses">Teses</TabsTrigger>
          <TabsTrigger value="faixas">Faixas e comissão</TabsTrigger>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="teses"><SecaoTeses catalogo={ws.catalogo} atual={conteudo} publicada={publicada} onChange={editar} disabled={!pode} /></TabsContent>
        <TabsContent value="faixas"><SecaoFaixas conferencia={conferencia} atual={conteudo} publicada={publicada} onChange={editar} disabled={!pode} /></TabsContent>
        <TabsContent value="geral"><SecaoGeral atual={conteudo} publicada={publicada} onChange={editar} disabled={!pode} /></TabsContent>
        <TabsContent value="historico">
          <Historico organizationId={organizationId} versoes={ws.historico} podeRestaurar={ws.podePublicar}
            onRestaurar={(id) => acao(() => callAdmin(organizationId, 'restore', { version_id: id, expected_updated_at: tokenRef.current }), 'Versão restaurada como rascunho. Confira e publique.')} />
        </TabsContent>
      </Tabs>

      <Simulador organizationId={organizationId} conteudo={conteudo} aberto={janela === 'simular'} onFechar={() => setJanela(null)} />
      <PreviaImpacto organizationId={organizationId} conteudo={conteudo} aberto={janela === 'impacto'} onFechar={() => setJanela(null)} />
      <Publicar aberto={janela === 'publicar'} onFechar={() => setJanela(null)} problemas={problemas} mudancas={mudancas}
        onPublicar={async (nota) => {
          try {
            const r = await callAdmin<{ numero: number }>(organizationId, 'publish', { note: nota, expected_updated_at: tokenRef.current });
            toast({ description: `Calibração v${r.numero} publicada. As próximas classificações já usam esta versão.` });
            setJanela(null); await recarregar();
          } catch (e) {
            const extra = e instanceof CalibracaoApiError ? (e.extra.problemas as string[] | undefined) : undefined;
            toast({ variant: 'destructive', description: extra?.length ? `${erroDe(e)} ${extra.join('; ')}` : erroDe(e) });
          }
        }} />
      <ConfirmDialog open={janela === 'descartar'} onOpenChange={(v) => !v && setJanela(null)} title="Descartar rascunho?"
        description="As alterações não publicadas serão perdidas. A versão publicada continua valendo." confirmText="Descartar" variant="destructive"
        onConfirm={() => { setJanela(null); void acao(() => callAdmin(organizationId, 'discard_draft'), 'Rascunho descartado.'); }} />
      <ConfirmDialog open={janela === 'padrao'} onOpenChange={(v) => !v && setJanela(null)} title="Restaurar o padrão?"
        description="Cria um rascunho com a calibração inicial do pacote (v1). Nada é publicado até você publicar." confirmText="Restaurar"
        onConfirm={() => { setJanela(null); void acao(() => callAdmin(organizationId, 'restore', { version_id: 'padrao', expected_updated_at: tokenRef.current }), 'Padrão restaurado como rascunho.'); }} />
    </div>
  );
}
