import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowClockwise, DownloadSimple, PaperPlaneTilt, X } from '@phosphor-icons/react';
import { callSignatureRequests, SignatureApiError, SIGNATURE_STATUS_LABEL, PARTICIPANT_STATUS_LABEL } from '@/lib/signatureRequestsApi';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; opportunityId: string; canCreate: boolean }
type Step = 'list' | 'template' | 'preview';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '');

export function SignatureV2Sheet({ open, onOpenChange, opportunityId, canCreate }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('list');
  const [templateId, setTemplateId] = useState<string>('');
  const [signers, setSigners] = useState<Record<string, { name: string; email: string }>>({});
  const [unresolved, setUnresolved] = useState<{ ref: string; display_name: string }[]>([]);
  const [draft, setDraft] = useState<{ request_id: string; snapshot: any; snapshot_sha256: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cap = useQuery({
    queryKey: ['signature-capability', opportunityId],
    queryFn: () => callSignatureRequests<{ v2_enabled: boolean; requests: any[] }>('get_capability', { opportunity_id: opportunityId }),
    enabled: open,
  });
  const templates = useQuery({
    queryKey: ['signature-templates', opportunityId],
    queryFn: () => callSignatureRequests<{ templates: any[] }>('list_templates', { opportunity_id: opportunityId }),
    enabled: open && canCreate && step === 'template',
    retry: false,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['signature-capability', opportunityId] });
  const showErr = (e: unknown) => toast.error(e instanceof SignatureApiError ? e.message : 'Erro inesperado');

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await callSignatureRequests('prepare_contract', { opportunity_id: opportunityId, template_id: templateId, signers });
      setDraft(r); setUnresolved([]); setStep('preview'); refresh();
    } catch (e) {
      if (e instanceof SignatureApiError && e.code === 'signers_required') setUnresolved((e.extra.unresolved as any[]) ?? []);
      showErr(e);
    } finally { setBusy(false); }
  };
  const send = async (requestId: string) => {
    setBusy(true);
    try {
      await callSignatureRequests('send_for_signature', { request_id: requestId });
      toast.success('Contrato enviado para assinatura');
      setDraft(null); setStep('list'); refresh();
    } catch (e) { showErr(e); } finally { setBusy(false); }
  };
  const act = async (action: string, requestId: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await callSignatureRequests(action, { request_id: requestId, ...extra });
      if (action === 'get_download_url' && r?.url) window.open(r.url, '_blank', 'noopener');
      if (action === 'cancel_signature') toast.success('Envio cancelado');
      refresh();
    } catch (e) { showErr(e); } finally { setBusy(false); }
  };
  const openDraft = async (requestId: string) => {
    try { const r = await callSignatureRequests('get_preview', { request_id: requestId }); setDraft(r); setStep('preview'); } catch (e) { showErr(e); }
  };

  const previewHtml = useMemo(() => {
    const pages = draft?.snapshot?.documents?.[0]?.frozen_content?.pages ?? [];
    return pages.map((p: any) => (p.blocks ?? []).filter((b: any) => b.type === 'text' || b.type === 'heading')
      .map((b: any) => DOMPurify.sanitize(b.type === 'heading' ? `<h3>${b.content ?? ''}</h3>` : `<div>${b.content ?? ''}</div>`)).join(''));
  }, [draft]);

  const requests = cap.data?.requests ?? [];

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep('list'); setDraft(null); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle>Assinatura de contrato</SheetTitle>
          <SheetDescription>Prepare, confira e acompanhe o envio sem sair do Seialz.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {step === 'list' && (
              <>
                {canCreate && <Button onClick={() => setStep('template')}><PaperPlaneTilt className="h-4 w-4 mr-2" />Novo envio</Button>}
                {!canCreate && <p className="text-sm text-muted-foreground">Novos envios usam o fluxo atual. Os envios abaixo continuam acompanháveis.</p>}
                {cap.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
                {requests.length === 0 && !cap.isLoading && <p className="text-sm text-muted-foreground">Nenhum envio por este fluxo ainda.</p>}
                {requests.map((r: any) => (
                  <div key={r.id} className="border border-border rounded-[6px] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.template_name ?? 'Contrato'}</p>
                        <p className="text-xs text-muted-foreground">Criado em {fmt(r.created_at)}{r.sent_at ? ` · enviado em ${fmt(r.sent_at)}` : ''}{r.completed_at ? ` · concluído em ${fmt(r.completed_at)}` : ''}</p>
                      </div>
                      <Badge variant={r.status === 'completed' ? 'default' : r.status === 'cancelled' ? 'secondary' : 'outline'}>{SIGNATURE_STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </div>
                    <ul className="text-sm space-y-1">
                      {(r.signature_request_participants ?? []).sort((a: any, b: any) => a.order_index - b.order_index).map((p: any) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="truncate">{p.name} <span className="text-muted-foreground">({p.email})</span></span>
                          <span className="text-xs text-muted-foreground shrink-0">{PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}{p.signed_at ? ` · ${fmt(p.signed_at)}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'draft' && canCreate && <Button size="sm" onClick={() => openDraft(r.id)}>Conferir e enviar</Button>}
                      {r.provider_operation_id && <Button size="sm" variant="outline" disabled={busy} onClick={() => act('get_signature_status', r.id)}><ArrowClockwise className="h-4 w-4 mr-1" />Atualizar</Button>}
                      {r.status === 'completed' && (r.provider_documents ?? []).map((d: any) => (
                        <Button key={d.document_id} size="sm" variant="outline" disabled={busy} onClick={() => act('get_download_url', r.id, { document_id: d.document_id })}><DownloadSimple className="h-4 w-4 mr-1" />{d.title ?? 'PDF'}</Button>
                      ))}
                      {['draft', 'sent', 'in_progress'].includes(r.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('cancel_signature', r.id)}><X className="h-4 w-4 mr-1" />Cancelar</Button>}
                    </div>
                  </div>
                ))}
              </>
            )}

            {step === 'template' && (
              <div className="space-y-4">
                <p className="text-sm font-medium">Escolha o modelo</p>
                {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
                {templates.error && <p className="text-sm text-destructive">{(templates.error as Error).message}</p>}
                <div className="space-y-2">
                  {(templates.data?.templates ?? []).map((t: any) => {
                    const item = (
                      <button key={t.id} type="button" disabled={!t.v2_compatible}
                        onClick={() => { setTemplateId(t.id); setUnresolved([]); setSigners({}); }}
                        className={`w-full text-left border rounded-[6px] p-3 ${templateId === t.id ? 'border-primary bg-muted' : 'border-border'} ${!t.v2_compatible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <p className="font-medium">{t.name}</p>
                        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                      </button>
                    );
                    return t.v2_compatible ? item : (
                      <Tooltip key={t.id}><TooltipTrigger asChild><span className="block">{item}</span></TooltipTrigger>
                        <TooltipContent>Este modelo ainda não é compatível com o novo fluxo de assinatura.</TooltipContent></Tooltip>
                    );
                  })}
                </div>
                {unresolved.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Demais signatários</p>
                    {unresolved.map((u) => (
                      <div key={u.ref} className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">{u.display_name} — nome</Label>
                          <Input value={signers[u.ref]?.name ?? ''} maxLength={200} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], name: e.target.value, email: s[u.ref]?.email ?? '' } }))} /></div>
                        <div><Label className="text-xs">E-mail</Label>
                          <Input type="email" value={signers[u.ref]?.email ?? ''} maxLength={255} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], email: e.target.value, name: s[u.ref]?.name ?? '' } }))} /></div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStep('list')}>Voltar</Button>
                  <Button disabled={!templateId || busy} onClick={prepare}>{busy ? 'Preparando…' : 'Preencher com dados do CRM'}</Button>
                </div>
              </div>
            )}

            {step === 'preview' && draft && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Signatários</p>
                  <ul className="text-sm">{(draft.snapshot?.participants ?? []).map((p: any) => <li key={p.ref}>{p.name} — {p.email}</li>)}</ul>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Prévia do contrato</p>
                  <div className="space-y-4">
                    {previewHtml.map((h: string, i: number) => (
                      <div key={i} className="border border-border rounded-[6px] p-4 bg-card text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: h }} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">Conteúdo congelado · {draft.snapshot_sha256.slice(0, 16)}…</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setStep('list'); setDraft(null); }}>Voltar</Button>
                  <Button disabled={busy} onClick={() => send(draft.request_id)}><PaperPlaneTilt className="h-4 w-4 mr-2" />{busy ? 'Enviando…' : 'Enviar para assinatura'}</Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
