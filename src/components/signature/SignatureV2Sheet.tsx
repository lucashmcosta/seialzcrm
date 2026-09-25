import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowClockwise, DownloadSimple, PaperPlaneTilt, X } from '@phosphor-icons/react';
import { callSignatureRequests, SignatureApiError, SIGNATURE_STATUS_LABEL, PARTICIPANT_STATUS_LABEL } from '@/lib/signatureRequestsApi';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; opportunityId: string; canCreate: boolean }
type Step = 'list' | 'template' | 'preview';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '');

export function SignatureV2Sheet({ open, onOpenChange, opportunityId, canCreate }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('list');
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [docTab, setDocTab] = useState(0);
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
      const r = await callSignatureRequests('prepare_contract', { opportunity_id: opportunityId, template_ids: templateIds, signers });
      setDraft(r); setDocTab(0); setUnresolved([]); setStep('preview'); refresh();
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
    try { const r = await callSignatureRequests('get_preview', { request_id: requestId }); setDraft(r); setDocTab(0); setStep('preview'); } catch (e) { showErr(e); }
  };

  const draftDocs: any[] = draft?.snapshot?.documents ?? [];
  const previewHtml = useMemo(() => {
    const pages = draftDocs[docTab]?.frozen_content?.pages ?? [];
    return pages.map((p: any) => (p.blocks ?? []).filter((b: any) => b.type === 'text' || b.type === 'heading')
      .map((b: any) => DOMPurify.sanitize(b.type === 'heading' ? `<h3>${b.content ?? ''}</h3>` : `<div>${b.content ?? ''}</div>`)).join(''));
  }, [draft, docTab]);

  const requests = cap.data?.requests ?? [];

  const docCountLabel = (n: number) => (n === 1 ? '1 documento selecionado' : `${n} documentos selecionados`);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep('list'); setDraft(null); } }}>
      <DialogContent className="w-[calc(100vw-16px)] max-w-[1040px] max-h-[90dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0 text-left">
          <DialogTitle>Assinatura de contrato</DialogTitle>
          <DialogDescription>Prepare, confira e acompanhe o envio sem sair do Seialz.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="p-5 space-y-4">
            {step === 'list' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Solicitações</p>
                  {canCreate && <Button onClick={() => setStep('template')}><PaperPlaneTilt className="h-4 w-4 mr-2" />Novo envio</Button>}
                </div>
                {!canCreate && <p className="text-sm text-muted-foreground">Novos envios usam o fluxo atual. Os envios abaixo continuam acompanháveis.</p>}
                {cap.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
                {requests.length === 0 && !cap.isLoading && (
                  <div className="border border-dashed border-border rounded-[6px] p-8 text-center text-sm text-muted-foreground">Nenhum envio por este fluxo ainda.</div>
                )}
                <div className="grid gap-3">
                  {requests.map((r: any) => (
                    <div key={r.id} className="border border-border rounded-[6px] bg-card">
                      <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b border-border">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{r.template_name ?? 'Contrato'}</p>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground font-data">
                            <span>Criado {fmt(r.created_at)}</span>
                            {r.sent_at && <span>Enviado {fmt(r.sent_at)}</span>}
                            {r.completed_at && <span>Concluído {fmt(r.completed_at)}</span>}
                          </div>
                        </div>
                        <Badge variant={r.status === 'completed' ? 'default' : r.status === 'cancelled' ? 'secondary' : 'outline'}>{SIGNATURE_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4 p-4">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Participantes</p>
                          <ul className="space-y-2">
                            {(r.signature_request_participants ?? []).sort((a: any, b: any) => a.order_index - b.order_index).map((p: any) => (
                              <li key={p.id} className="text-sm">
                                <div className="flex justify-between gap-2">
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}</span>
                                </div>
                                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="truncate">{p.email}</span>
                                  {p.signed_at && <span className="shrink-0 font-data">{fmt(p.signed_at)}</span>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Documentos</p>
                          {(r.provider_documents ?? []).length === 0 && <p className="text-xs text-muted-foreground">Disponíveis após o envio.</p>}
                          <div className="space-y-1.5">
                            {(r.provider_documents ?? []).map((d: any) => {
                              const done = d.final_sha256 || r.status === 'completed';
                              return (
                                <div key={d.document_id} className="flex items-center justify-between gap-2 rounded-[6px] bg-muted px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm truncate">{d.title ?? 'Documento'}</p>
                                    <p className="text-xs text-muted-foreground">{done ? 'concluído' : SIGNATURE_STATUS_LABEL[d.status] ?? 'em andamento'}</p>
                                  </div>
                                  {done && <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => act('get_download_url', r.id, { document_id: d.document_id })}><DownloadSimple className="h-4 w-4 mr-1" />Baixar</Button>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-border">
                        {['draft', 'sent', 'in_progress'].includes(r.status) && <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => act('cancel_signature', r.id)}><X className="h-4 w-4 mr-1" />Cancelar</Button>}
                        {r.provider_operation_id && <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => act('get_signature_status', r.id)}><ArrowClockwise className="h-4 w-4 mr-1" />Atualizar</Button>}
                        {r.status === 'draft' && canCreate && <Button size="sm" className="h-7" onClick={() => openDraft(r.id)}>Conferir e enviar</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === 'template' && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Escolha os documentos</p>
                  <p className="text-xs text-muted-foreground">Todos os documentos marcados vão juntos em um único envio, com um único link para o cliente.</p>
                </div>
                {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
                {templates.error && <p className="text-sm text-destructive">{(templates.error as Error).message}</p>}
                <div className="grid sm:grid-cols-2 gap-2">
                  {(templates.data?.templates ?? []).map((t: any) => {
                    const checked = templateIds.includes(t.id);
                    const item = (
                      <button key={t.id} type="button" disabled={!t.v2_compatible}
                        role="checkbox" aria-checked={checked}
                        onClick={() => { setTemplateIds((ids) => ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]); setUnresolved([]); }}
                        className={`w-full h-full text-left border rounded-[6px] p-4 flex gap-3 items-start transition-colors ${checked ? 'border-primary bg-muted' : 'border-border hover:bg-muted'} ${!t.v2_compatible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Checkbox checked={checked} disabled={!t.v2_compatible} className="mt-0.5 h-5 w-5 pointer-events-none" tabIndex={-1} />
                        <span className="min-w-0">
                          <span className="block font-medium break-words">{t.name}</span>
                          {t.description && <span className="block text-xs text-muted-foreground">{t.description}</span>}
                          {t.page_count != null && <span className="block text-xs text-muted-foreground">{t.page_count} {t.page_count === 1 ? 'página' : 'páginas'}</span>}
                          {!t.v2_compatible && <span className="block text-xs text-muted-foreground">Incompatível{(t.v2_unsupported_features ?? []).length ? `: ${t.v2_unsupported_features.join(', ')}` : ''}</span>}
                        </span>
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
                      <div key={u.ref} className="grid sm:grid-cols-2 gap-2">
                        <div><Label className="text-xs">{u.display_name} — nome</Label>
                          <Input value={signers[u.ref]?.name ?? ''} maxLength={200} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], name: e.target.value, email: s[u.ref]?.email ?? '' } }))} /></div>
                        <div><Label className="text-xs">E-mail</Label>
                          <Input type="email" value={signers[u.ref]?.email ?? ''} maxLength={255} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], email: e.target.value, name: s[u.ref]?.name ?? '' } }))} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 'preview' && draft && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Signatários</p>
                  <ul className="text-sm flex flex-wrap gap-2">{(draft.snapshot?.participants ?? []).map((p: any) => <li key={p.ref} className="rounded-[6px] bg-muted px-3 py-1.5 break-all">{p.name} — <span className="text-muted-foreground">{p.email}</span></li>)}</ul>
                </div>
                <p className="text-xs text-muted-foreground">Prévia — {draftDocs.length} documento(s) em uma única solicitação.</p>
                <div className="md:grid md:grid-cols-[220px_1fr] md:gap-4">
                  {draftDocs.length > 1 && (
                    <>
                      <select className="md:hidden mb-3 w-full h-9 rounded-[6px] border border-input bg-background px-2 text-sm" value={docTab} onChange={(e) => setDocTab(Number(e.target.value))}>
                        {draftDocs.map((d: any, i: number) => <option key={d.ref ?? i} value={i}>Documento {i + 1} — {d.title}</option>)}
                      </select>
                    </>
                  )}
                  <div className="hidden md:flex flex-col gap-1">
                    {draftDocs.map((d: any, i: number) => (
                      <button key={d.ref ?? i} type="button" onClick={() => setDocTab(i)}
                        className={`text-left rounded-[6px] px-3 py-2 text-sm transition-colors ${i === docTab ? 'bg-muted text-foreground border border-primary' : 'text-muted-foreground hover:bg-muted border border-transparent'}`}>
                        <span className="block text-xs">Documento {i + 1}</span>
                        <span className="block truncate">{d.title}</span>
                      </button>
                    ))}
                  </div>
                  <div className="min-w-0 space-y-4">
                    {previewHtml.map((h: string, i: number) => (
                      <div key={i} className="border border-border rounded-[6px] p-5 bg-card text-sm prose prose-sm max-w-none break-words" dangerouslySetInnerHTML={{ __html: h }} />
                    ))}
                    <p className="text-xs text-muted-foreground font-data">Conteúdo congelado · {draft.snapshot_sha256.slice(0, 16)}…</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {step === 'template' && (
          <div className="shrink-0 border-t border-border px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{docCountLabel(templateIds.length)}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep('list')}>Voltar</Button>
              <Button disabled={!templateIds.length || busy} onClick={prepare}>{busy ? 'Preparando…' : 'Preencher com dados do CRM'}</Button>
            </div>
          </div>
        )}
        {step === 'preview' && draft && (
          <div className="shrink-0 border-t border-border px-5 py-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => { setStep('list'); setDraft(null); }}>Voltar</Button>
            <Button disabled={busy} onClick={() => send(draft.request_id)}><PaperPlaneTilt className="h-4 w-4 mr-2" />{busy ? 'Enviando…' : draftDocs.length > 1 ? `Enviar ${draftDocs.length} documentos para assinatura` : 'Enviar 1 documento para assinatura'}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
