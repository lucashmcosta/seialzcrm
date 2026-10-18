import { useState } from 'react';
import { Lock, Scales } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ClassificationApiError, useClassificationState, useDecideCorrection, useRequestCorrection, type EstadoWidget } from './api';
import { ResumoEntrada } from './ResumoEntrada';
import { ClassificationReveal } from './ClassificationReveal';
import { ClassificationWizard, EmRevisao } from './ClassificationWizard';
import { dataHora } from './formato';
import { useProcessClassificationEnabled } from './ProcessClassificationSlot';


function Entrada({ podeClassificar, onComecar }: { podeClassificar: boolean; onComecar: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">Responda algumas perguntas sobre o caso. No final você vê a classificação e a sua comissão desta venda.</p>
      <p className="text-xs text-muted-foreground">Depois de finalizar, a classificação fica registrada nesta oportunidade e não dá para alterar.</p>
      {podeClassificar
        ? <Button onClick={onComecar}>Começar classificação</Button>
        : <p className="text-sm text-muted-foreground">Ainda não classificada.</p>}
    </div>
  );
}

function Corpo({ estado, opportunityId, onComecar }: { estado: EstadoWidget; opportunityId: string; onComecar: () => void }) {
  const c = estado.classificacao;
  switch (estado.estado) {
    case 'sem_classificacao':
    case 'correcao_liberada':
      return <Entrada podeClassificar={estado.podeClassificar} onComecar={onComecar} />;
    case 'fechada_sem_classificacao':
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium">Oportunidade fechada sem classificação</p>
          <p className="text-sm text-muted-foreground">A classificação só pode ser feita com a oportunidade aberta. Fale com o gestor.</p>
        </div>
      );
    case 'em_revisao':
      return <EmRevisao />;
    default: {
      if (!c?.faixa) return <EmRevisao />;
      return (
        <div className="space-y-3">
          <ClassificationReveal faixa={c.faixa} comissao={c.comissao} classificadoEm={c.classificadoEm} opportunityId={opportunityId} animar={false} />
          {estado.estado === 'fechada_classificada' && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Oportunidade fechada — classificação final.
            </p>
          )}
          {estado.estado === 'pedido_pendente' && estado.pedido && (
            <p className="text-center text-xs text-muted-foreground">Pedido de correção enviado ao gestor em {dataHora(estado.pedido.criadoEm)}.</p>
          )}
          {estado.estado === 'pedido_recusado' && estado.pedido && (
            <p className="text-center text-xs text-muted-foreground">
              Pedido de correção recusado pelo gestor{estado.pedido.motivo ? `: ${estado.pedido.motivo}` : '.'}
            </p>
          )}
          {estado.podePedirCorrecao && <PedirCorrecao opportunityId={opportunityId} />}
          {estado.podeDecidir && estado.respostas && estado.pedido && (
            <DecidirCorrecao opportunityId={opportunityId} respostas={estado.respostas} criadoEm={estado.pedido.criadoEm} />
          )}
        </div>
      );
    }
  }
}

const erroDe = (e: unknown) => (e instanceof ClassificationApiError ? e.message : 'Não foi possível concluir. Tente de novo.');

/** Vendedor: "Errei alguma resposta" cria um pedido pendente e avisa quem pode liberar (§6.1). */
function PedirCorrecao({ opportunityId }: { opportunityId: string }) {
  const pedir = useRequestCorrection(opportunityId);
  return (
    <div className="text-center">
      <Button variant="link" size="sm" disabled={pedir.isPending}
        onClick={() => pedir.mutate(undefined, {
          onSuccess: () => toast({ description: 'Pedido de correção enviado ao gestor.' }),
          onError: (e) => toast({ variant: 'destructive', description: erroDe(e) }),
        })}>
        Errei alguma resposta — pedir correção ao gestor
      </Button>
    </div>
  );
}

/** Gestor: vê as respostas, a faixa e a comissão (acima) e libera ou recusa com motivo (§6.2–6.3). */
function DecidirCorrecao({ opportunityId, respostas, criadoEm }: { opportunityId: string; respostas: Record<string, unknown>; criadoEm: string }) {
  const decidir = useDecideCorrection(opportunityId);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const enviar = (release: boolean) => decidir.mutate({ release, reason: release ? undefined : motivo }, {
    onSuccess: () => toast({ description: release ? 'Correção liberada. O vendedor pode refazer a classificação.' : 'Pedido recusado. O vendedor foi avisado.' }),
    onError: (e) => toast({ variant: 'destructive', description: erroDe(e) }),
  });
  return (
    <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
      <p className="text-sm font-medium">Pedido de correção enviado em {dataHora(criadoEm)}</p>
      <p className="text-xs text-muted-foreground">Respostas do vendedor. Ao liberar, a classificação atual continua valendo até a nova ser finalizada.</p>
      <ResumoEntrada entrada={respostas} detalhado />
      {recusando ? (
        <div className="space-y-2">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa (o vendedor vai ver)" maxLength={500} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setRecusando(false)}>Voltar</Button>
            <Button variant="destructive" className="flex-1" disabled={!motivo.trim() || decidir.isPending} onClick={() => enviar(false)}>Recusar pedido</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={decidir.isPending} onClick={() => setRecusando(true)}>Recusar</Button>
          <Button className="flex-1" disabled={decidir.isPending} onClick={() => enviar(true)}>Liberar correção</Button>
        </div>
      )}
    </div>
  );
}

/**
 * Classificação do processo na oportunidade (§5.1).
 * variant="card": card da Visão geral; o assistente abre num painel lateral (tela cheia no celular).
 * variant="inline": dentro de uma janela do Widget Workspace; o assistente roda no próprio espaço.
 */
export function ProcessClassificationCard({ opportunityId, variant = 'card' }: { opportunityId: string; variant?: 'card' | 'inline' }) {
  const enabled = useProcessClassificationEnabled();
  const { data: estado, isLoading, isError, refetch } = useClassificationState(opportunityId, enabled);
  const [preenchendo, setPreenchendo] = useState(false);
  const isMobile = useIsMobile();

  if (!enabled || estado === null) {
    return variant === 'inline'
      ? <p className="p-1 text-sm text-muted-foreground">A classificação desta oportunidade não está disponível para você.</p>
      : null;
  }

  const wizard = <ClassificationWizard key={opportunityId} opportunityId={opportunityId} onDone={() => setPreenchendo(false)} />;
  const corpo = isLoading ? (
    <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-48" /></div>
  ) : isError || !estado ? (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Não foi possível carregar a classificação.</p>
      <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
    </div>
  ) : (
    <Corpo estado={estado} opportunityId={opportunityId} onComecar={() => setPreenchendo(true)} />
  );

  if (variant === 'inline') return <div className="p-1">{preenchendo ? wizard : corpo}</div>;

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Scales className="h-5 w-5" /> Classificação do processo</CardTitle>
        </CardHeader>
        <CardContent>{corpo}</CardContent>
      </Card>
      <Sheet open={preenchendo} onOpenChange={setPreenchendo}>
        {/* fora do painel não fecha: um toque sem querer perderia as respostas */}
        <SheetContent side={isMobile ? 'bottom' : 'right'} onInteractOutside={(e) => e.preventDefault()}
          className={cn('flex flex-col', isMobile ? 'h-[100dvh]' : 'w-full sm:max-w-lg')}>
          <SheetHeader>
            <SheetTitle>Classificação do processo</SheetTitle>
            <SheetDescription className="sr-only">Assistente de classificação do processo desta oportunidade</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{preenchendo && wizard}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
