import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useOrganization } from '@/hooks/useOrganization';
import { useNammuxNotices, useNammuxNoticesFlagState } from '@/hooks/useNammuxNotices';
import {
  decideNotice, NAMMUX_NOTICES_QUERY_KEY, noticeKindLabel, noticeSituation, previewProblemText,
  type NoticeItem,
} from '@/lib/nammuxNotices';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

const STATUS_BADGE: Record<NoticeItem['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending_approval: { label: 'Aguardando aprovação', variant: 'default' },
  needs_review: { label: 'Precisa de conferência', variant: 'destructive' },
  dead_letter: { label: 'Falhou', variant: 'destructive' },
  skipped: { label: 'Não saiu', variant: 'outline' },
};

function NoticeCard({ item, organizationId }: { item: NoticeItem; organizationId: string }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const badge = STATUS_BADGE[item.status];
  const needsPerson = item.status !== 'skipped';
  // Aviso que já saiu e ficou desmentido não tem "enviar": só dar baixa.
  const acknowledgeOnly = item.statusReason === 'payment_reversed_after_sent';

  const decide = useMutation({
    mutationFn: (approve: boolean) => decideNotice(organizationId, item.id, approve, approve ? undefined : reason),
    onSuccess: (res, approve) => {
      toast.success(
        !approve ? (acknowledgeOnly ? 'Pendência baixada.' : 'Aviso recusado. Ele não vai sair.')
          : res.status === 'expired' ? 'O prazo deste aviso já passou. Ele não foi enviado.'
          : 'Aviso aprovado. Ele sai em instantes.',
      );
      qc.invalidateQueries({ queryKey: NAMMUX_NOTICES_QUERY_KEY });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: NAMMUX_NOTICES_QUERY_KEY });
    },
  });

  return (
    <article className="rounded-md border border-border bg-card p-4 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            <Link to={`/contacts/${item.contactId}`} className="hover:underline">{item.contactName || 'Cliente'}</Link>
          </div>
          <div className="text-sm text-muted-foreground">{noticeKindLabel(item.kind)}</div>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </header>

      <p className="text-sm flex items-start gap-2">
        {needsPerson ? <WarningCircle className="shrink-0 mt-0.5" /> : <Info className="shrink-0 mt-0.5" />}
        <span>{noticeSituation(item)}</span>
      </p>

      {item.preview ? (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Mensagem que o cliente recebe</div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{item.preview}</div>
        </div>
      ) : (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{previewProblemText(item.previewProblem)}</div>
      )}

      <div className="text-xs text-muted-foreground font-data">
        Criado em {when(item.createdAt)}
        {item.expiresAt ? ` · vale até ${when(item.expiresAt)}` : ''}
        {item.attempts > 0 ? ` · ${item.attempts} tentativa${item.attempts === 1 ? '' : 's'}` : ''}
      </div>

      {needsPerson && (
        rejecting ? (
          <div className="space-y-2">
            <Textarea value={reason} maxLength={300} rows={2} placeholder="Motivo (opcional)"
              onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" disabled={decide.isPending} onClick={() => setRejecting(false)}>Voltar</Button>
              <Button variant="destructive" size="sm" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                {acknowledgeOnly ? 'Dar baixa' : 'Confirmar: não enviar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" disabled={decide.isPending} onClick={() => setRejecting(true)}>
              <XCircle className="mr-1" /> {acknowledgeOnly ? 'Dar baixa' : 'Não enviar'}
            </Button>
            {!acknowledgeOnly && (
              <Button size="sm" disabled={decide.isPending || !item.canApprove} onClick={() => decide.mutate(true)}>
                <CheckCircle className="mr-1" /> {item.status === 'pending_approval' ? 'Aprovar e enviar' : 'Enviar de novo'}
              </Button>
            )}
          </div>
        )
      )}
    </article>
  );
}

export default function NammuxNoticesPage() {
  const { organization } = useOrganization();
  const flag = useNammuxNoticesFlagState(organization?.id);
  const { data, isLoading, error } = useNammuxNotices(organization?.id, flag.enabled);

  const { waiting, stopped } = useMemo(() => {
    const items = data?.items ?? [];
    return { waiting: items.filter((i) => i.status !== 'skipped'), stopped: items.filter((i) => i.status === 'skipped') };
  }, [data]);

  // Sem a flag da organização a tela não existe. Só decide depois de a flag responder.
  if (organization && flag.resolved && !flag.enabled) {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Avisos ao cliente</h1>
          <p className="text-sm text-muted-foreground">
            Avisos automáticos sobre o processo que precisam de uma pessoa antes de sair, ou que não saíram.
          </p>
        </header>

        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}

        {data && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Esperando uma pessoa ({waiting.length})</h2>
              {waiting.length === 0
                ? <div className="text-sm text-muted-foreground">Nenhum aviso esperando.</div>
                : waiting.map((item) => <NoticeCard key={item.id} item={item} organizationId={organization!.id} />)}
            </section>

            {stopped.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium">Não saíram nos últimos 7 dias ({stopped.length})</h2>
                {stopped.map((item) => <NoticeCard key={item.id} item={item} organizationId={organization!.id} />)}
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
