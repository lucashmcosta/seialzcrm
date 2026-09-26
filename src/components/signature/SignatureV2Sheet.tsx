import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowClockwise, ArrowLeft, Check, DownloadSimple, FileText, LinkSimple, Plus, WarningCircle } from '@phosphor-icons/react';
import { callSignatureRequests, SignatureApiError, SIGNATURE_STATUS_LABEL, PARTICIPANT_STATUS_LABEL } from '@/lib/signatureRequestsApi';
import { FrozenDocumentPreview } from './FrozenDocumentPreview';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; opportunityId: string; canCreate: boolean }
type Step = 'list' | 'template' | 'data' | 'preview';
type Draft = { request_id: string; snapshot: any; snapshot_sha256: string };
type Pending = { title: string; items: string[]; contactId?: string } | null;

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' às') : '');
const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

const participantsOf = (r: any) => [...(r.signature_request_participants ?? [])].sort((a: any, b: any) => a.order_index - b.order_index);
// Solicitações antigas: pode não haver snapshot v2 nem provider_documents.
const docTitlesOf = (r: any): string[] => {
  const pd = (r.provider_documents ?? []).map((d: any) => d.title).filter(Boolean);
  if (pd.length) return pd;
  return r.template_name ? String(r.template_name).split(' + ') : ['Contrato'];
};
const relevantDate = (r: any) => r.completed_at ?? r.cancelled_at ?? r.sent_at ?? r.created_at;

const STATUS_TONE: Record<string, { pill: string; dot: string }> = {
  sent: { pill: 'bg-info/10 text-info', dot: 'bg-info' },
  completing: { pill: 'bg-info/10 text-info', dot: 'bg-info' },
  in_progress: { pill: 'bg-warning/15 text-warning', dot: 'bg-warning' },
  completed: { pill: 'bg-success/15 text-success', dot: 'bg-success' },
  cancelled: { pill: 'bg-muted text-muted-foreground', dot: 'border border-muted-foreground' },
  draft: { pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
};
function StatusBadge({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${t.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{SIGNATURE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const STEPS: [Step, string][] = [['template', 'Documentos'], ['data', 'Dados e signatários'], ['preview', 'Revisar e enviar']];
function Stepper({ step }: { step: Step }) {
  const cur = STEPS.findIndex(([s]) => s === step);
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map(([s, label], i) => (
        <li key={s} className="flex items-center gap-3">
          {i > 0 && <span className={`h-px w-8 ${i <= cur ? 'bg-primary' : 'bg-border'}`} />}
          <span className="flex items-center gap-2">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${i === cur ? 'bg-primary text-primary-foreground' : i < cur ? 'bg-success/15 text-success' : 'border border-border text-muted-foreground'}`}>
              {i < cur ? <Check className="h-3 w-3" weight="bold" /> : i + 1}
            </span>
            <span className={`hidden sm:inline text-xs ${i <= cur ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const CLIENT_LABELS: [string, string][] = [['name', 'Nome'], ['email', 'E-mail'], ['phone', 'Telefone']];
const CUSTOM_CLIENT: [string, string][] = [['cpf', 'CPF'], ['rg', 'RG'], ['nationality', 'Nacionalidade']];
const CUSTOM_ADDR: [string, string][] = [['Endereco', 'Endereço'], ['Bairro', 'Bairro'], ['CEP', 'CEP']];
const CUSTOM_DEAL: [string, string][] = [['deal_title', 'Oportunidade'], ['deal_amount', 'Valor'], ['deal_close_date', 'Data de fechamento']];

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm break-words">{value}</p></div>;
}

export function SignatureV2Sheet({ open, onOpenChange, opportunityId, canCreate }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [docTab, setDocTab] = useState(0);
  const [signers, setSigners] = useState<Record<string, { name: string; email: string }>>({});
  const [unresolved, setUnresolved] = useState<{ ref: string; display_name: string }[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  const requests: any[] = cap.data?.requests ?? [];
  useEffect(() => {
    if (!requests.length) { setSelectedId(null); return; }
    if (!selectedId || !requests.some((r) => r.id === selectedId)) setSelectedId(requests[0].id);
  }, [requests, selectedId]);
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['signature-capability', opportunityId] });
  const showErr = (e: unknown) => toast.error(e instanceof SignatureApiError ? e.message : 'Erro inesperado');
  const reset = () => { setStep('list'); setDraft(null); setPending(null); setUnresolved([]); setMobileDetail(false); };

  const prepare = async () => {
    setBusy(true); setPending(null);
    try {
      const r = await callSignatureRequests<Draft>('prepare_contract', { opportunity_id: opportunityId, template_ids: templateIds, signers });
      setDraft(r); setDocTab(0); setUnresolved([]); setStep('data'); refresh();
    } catch (e) {
      setDraft(null);
      if (e instanceof SignatureApiError && e.code === 'signers_required') { setUnresolved((e.extra.unresolved as any[]) ?? []); setStep('data'); }
      else if (e instanceof SignatureApiError && e.code === 'missing_contact_fields') {
        const items = (e.extra.missing as string[]) ?? [];
        setPending({ title: `${plural(items.length, 'informação precisa', 'informações precisam')} ser corrigida${items.length === 1 ? '' : 's'} no CRM`, items, contactId: e.extra.contact_id as string });
        setStep('data');
      } else if (e instanceof SignatureApiError && e.code === 'unresolved_template_variables') {
        const items = (e.extra.unresolved_variables as string[]) ?? [];
        setPending({ title: `${plural(items.length, 'informação do modelo está', 'informações do modelo estão')} sem valor no CRM`, items });
        setStep('data');
      } else showErr(e);
    } finally { setBusy(false); }
  };
  const send = async (requestId: string) => {
    setBusy(true);
    try {
      await callSignatureRequests('send_for_signature', { request_id: requestId });
      toast.success('Contrato enviado para assinatura');
      setSelectedId(requestId); reset(); refresh();
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
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  // Link vem só do servidor; não é guardado nem registrado.
  const copyLink = async (requestId: string, participantId: string) => {
    setLinkBusy(participantId);
    try {
      const r = await callSignatureRequests<{ signing_url: string }>('get_signing_link', { request_id: requestId, participant_id: participantId });
      await navigator.clipboard.writeText(r.signing_url);
      toast.success('Link de assinatura copiado');
    } catch (e) {
      if (e instanceof SignatureApiError && e.code === 'participant_already_signed') { toast.info('Este participante já assinou'); refresh(); }
      else showErr(e);
    } finally { setLinkBusy(null); }
  };
  // Retoma no estado correto: snapshot completo → prévia; senão → dados (A2).
  const resumeDraft = async (requestId: string) => {
    setBusy(true);
    try {
      const r = await callSignatureRequests<Draft>('get_preview', { request_id: requestId });
      const ok = !!r.snapshot_sha256 && Array.isArray(r.snapshot?.documents) && r.snapshot.documents.length > 0 && (r.snapshot?.participants ?? []).length > 0;
      setDraft(ok ? r : null); setDocTab(0); setPending(null);
      if (!ok) setTemplateIds((r.snapshot?.templates ?? []).map((t: any) => t.id).filter(Boolean));
      setStep(ok ? 'preview' : 'data');
    } catch (e) { showErr(e); } finally { setBusy(false); }
  };
  const discardDraft = async (requestId: string) => {
    setBusy(true);
    try {
      await callSignatureRequests('discard_draft', { request_id: requestId });
      toast.success('Rascunho descartado');
      setSelectedId(requests.find((x) => x.id !== requestId)?.id ?? null);
      refresh();
    } catch (e) { showErr(e); refresh(); } finally { setBusy(false); }
  };

  const draftDocs: any[] = draft?.snapshot?.documents ?? [];
  const draftParts: any[] = draft?.snapshot?.participants ?? [];
  const previewHtml = useMemo(() => {
    const pages = draftDocs[docTab]?.frozen_content?.pages ?? [];
    return pages.map((p: any) => (p.blocks ?? []).filter((b: any) => b.type === 'text' || b.type === 'heading')
      .map((b: any) => DOMPurify.sanitize(b.type === 'heading' ? `<h3>${b.content ?? ''}</h3>` : `<div>${b.content ?? ''}</div>`)).join(''));
  }, [draft, docTab]);
  const docsForParticipant = (ref: string) => draftDocs.filter((d) => (d.fields ?? []).some((f: any) => f.participant_ref === ref)).length || draftDocs.length;

  // ---------- Lista (coluna esquerda) ----------
  const listCol = (
    <div className="flex flex-col min-h-0">
      <p className="text-xs font-semibold text-muted-foreground px-3 pb-3">Solicitações</p>
      {!canCreate && <p className="text-xs text-muted-foreground px-3 pb-3">Novos envios usam o fluxo atual. Os envios abaixo continuam acompanháveis.</p>}
      {cap.isLoading && <p className="text-sm text-muted-foreground px-3">Carregando…</p>}
      {!cap.isLoading && requests.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nenhum envio por este fluxo ainda.</p>}
      <div className="flex flex-col gap-0.5">
        {requests.map((r) => {
          const titles = docTitlesOf(r); const parts = participantsOf(r); const main = parts[0];
          const active = r.id === selectedId;
          return (
            <button key={r.id} type="button" aria-pressed={active} onClick={() => { setSelectedId(r.id); setMobileDetail(true); }}
              className={`text-left rounded-[6px] px-3 py-2.5 border transition-colors ${active ? 'bg-primary/5 border-primary/25' : 'border-transparent hover:bg-muted'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug line-clamp-2">{titles.join(' + ')}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-muted-foreground truncate mt-1">{main?.name ?? '—'}{parts.length > 1 ? ` +${parts.length - 1}` : ''} · {plural(titles.length, 'documento', 'documentos')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDay(relevantDate(r))}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---------- Detalhe (painel direito) ----------
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <p className="text-xs font-semibold text-foreground pb-2 border-b border-border">{title}</p>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
  const detail = (r: any) => {
    const parts = participantsOf(r); const titles = docTitlesOf(r);
    const docs: any[] = r.provider_documents ?? [];
    const done = r.status === 'completed';
    const draftRow = r.status === 'draft';
    const dateLine = draftRow ? `Criado em ${fmt(r.created_at)} · ainda não enviado`
      : r.completed_at ? `Concluído em ${fmt(r.completed_at)}`
      : r.cancelled_at ? `Cancelado em ${fmt(r.cancelled_at)}`
      : r.sent_at ? `Enviado em ${fmt(r.sent_at)}` : `Criado em ${fmt(r.created_at)}`;
    const canRefresh = !!r.provider_operation_id && !['completed', 'cancelled'].includes(r.status);
    const canCancel = !!r.provider_operation_id && ['sent', 'in_progress'].includes(r.status);
    return (
      <div className="flex flex-col min-h-full">
        <div className="space-y-2">
          <StatusBadge status={r.status} />
          <h3 className="text-xl font-semibold leading-tight break-words">{titles.join(' + ')}</h3>
          <p className="text-xs text-muted-foreground">{dateLine}</p>
        </div>
        <div className="space-y-8 mt-8">
          <Section title="Participantes">
            {parts.length === 0 && <li className="py-3 text-sm text-muted-foreground">—</li>}
            {parts.map((p) => {
              const signed = p.status === 'signed';
              return (
                <li key={p.id ?? p.email} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex gap-2">
                    {done && signed && <Check className="h-4 w-4 text-success mt-0.5 shrink-0" weight="bold" />}
                    <div className="min-w-0"><p className="text-sm font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
                  </div>
                  {!draftRow && (
                    <p className={`text-xs flex items-center gap-1.5 ${signed ? 'text-success' : 'text-warning'}`}>
                      {signed && !done && <Check className="h-3.5 w-3.5" weight="bold" />}
                      {signed ? `Assinou${p.signed_at ? ` em ${fmt(p.signed_at)}` : ''}` : ['sent', 'in_progress'].includes(r.status) ? 'Aguardando assinatura' : PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  )}
                  <div className="sm:justify-self-end">
                    {!signed && p.id && r.provider_operation_id && ['sent', 'in_progress'].includes(r.status) && (
                      <Button size="sm" variant="outline" className="h-8 px-3" disabled={linkBusy === p.id} onClick={() => copyLink(r.id, p.id)}>
                        <LinkSimple className="h-3.5 w-3.5 mr-1.5" />{linkBusy === p.id ? 'Copiando…' : 'Copiar link'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </Section>
          <Section title="Documentos">
            {(docs.length ? docs : titles.map((t) => ({ title: t }))).map((d: any, i: number) => {
              const dDone = !!d.final_sha256 || done;
              return (
                <li key={d.document_id ?? i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_auto] items-center gap-x-4 py-3 min-h-[48px]">
                  <div className="min-w-0 flex items-center gap-2">
                    {dDone ? <Check className="h-4 w-4 text-success shrink-0" weight="bold" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <p className="text-sm truncate">{d.title ?? 'Documento'}</p>
                  </div>
                  <p className="hidden sm:block text-xs text-muted-foreground">{draftRow ? '' : dDone ? 'Concluído' : r.status === 'in_progress' ? 'Aguardando assinaturas' : SIGNATURE_STATUS_LABEL[r.status] ?? r.status}</p>
                  <div className="justify-self-end">
                    {dDone && d.document_id && <Button size="sm" variant="outline" className="h-8 px-3" disabled={busy} onClick={() => act('get_download_url', r.id, { document_id: d.document_id })}><DownloadSimple className="h-3.5 w-3.5 mr-1.5" />Baixar</Button>}
                  </div>
                </li>
              );
            })}
          </Section>
        </div>
        {(draftRow ? canCreate : canRefresh || canCancel) && (
          <div className="mt-auto pt-10 flex flex-wrap items-center gap-5">
            {draftRow && <Button disabled={busy} onClick={() => resumeDraft(r.id)}>Continuar preparação</Button>}
            {draftRow && !r.provider_operation_id && !r.sent_at && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" disabled={busy} className="text-sm text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50">Descartar rascunho</button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
                    <AlertDialogDescription>Este rascunho ainda não foi enviado e será removido da lista.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => discardDraft(r.id)}>Descartar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canRefresh && <Button size="sm" variant="outline" className="h-8 px-3" disabled={busy} onClick={() => act('get_signature_status', r.id)}><ArrowClockwise className="h-3.5 w-3.5 mr-1.5" />Atualizar</Button>}
            {canCancel && <button type="button" disabled={busy} className="text-sm text-destructive hover:underline disabled:opacity-50" onClick={() => act('cancel_signature', r.id)}>Cancelar solicitação</button>}
          </div>
        )}
      </div>
    );
  };

  const vars = draft?.snapshot?.variables ?? {};
  const client = vars.client ?? {}; const custom = vars.custom ?? {};
  const cityUf = [custom.Cidade, custom.Estado].filter(Boolean).join(' / ');
  const templateList: any[] = templates.data?.templates ?? [];
  const footer = 'shrink-0 border-t border-border px-6 py-3 flex flex-wrap items-center justify-between gap-3';

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="w-[calc(100vw-16px)] max-w-[1100px] h-[90dvh] max-h-[860px] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border pl-7 pr-14 py-4 min-h-[72px] flex flex-row items-center justify-between gap-4 space-y-0 text-left">
          <DialogTitle className="text-lg font-semibold">{step === 'list' ? 'Assinatura de contrato' : 'Novo envio'}</DialogTitle>
          <DialogDescription className="sr-only">Prepare, confira e acompanhe o envio sem sair do Seialz.</DialogDescription>
          {step === 'list'
            ? canCreate && <Button size="sm" className="h-9 px-4" onClick={() => { setTemplateIds([]); setSigners({}); setStep('template'); }}><Plus className="h-4 w-4 mr-1.5" />Novo envio</Button>
            : <Stepper step={step} />}
        </DialogHeader>

        {step === 'list' && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <aside data-sv2="list" className={`${mobileDetail ? 'hidden' : 'flex'} md:flex w-full md:w-[360px] shrink-0 flex-col md:border-r border-border px-3 py-5 overflow-y-auto scrollbar-hide`}>{listCol}</aside>
            <main data-sv2="detail" className={`${mobileDetail ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-hide px-6 md:px-10 py-7`}>
              <Button variant="ghost" size="sm" className="md:hidden mb-3 -ml-2 self-start" onClick={() => setMobileDetail(false)}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
              {selected ? detail(selected) : <p className="text-sm text-muted-foreground">Selecione uma solicitação ou crie um novo envio.</p>}
            </main>
          </div>
        )}

        {step === 'template' && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-10">
              <div className="max-w-[620px] mx-auto space-y-6">
                <div><h3 className="text-lg font-semibold">Escolha os documentos</h3>
                  <p className="text-sm text-muted-foreground mt-1">Os documentos selecionados são enviados juntos, em um único link de assinatura.</p></div>
                {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
                {templates.error && <p className="text-sm text-destructive">{(templates.error as Error).message}</p>}
                <div className="flex flex-col gap-2">
                  {templateList.map((t: any) => {
                    const checked = templateIds.includes(t.id); const ok = !!t.v2_compatible;
                    const sub = !ok ? `Incompatível${(t.v2_unsupported_features ?? []).length ? `: ${t.v2_unsupported_features.join(', ')}` : ''}`
                      : (isFriendlyDescription(t.description) ? t.description : null) ?? (t.page_count != null ? plural(t.page_count, 'página', 'páginas') : null);
                    return (
                      <button key={t.id} type="button" disabled={!ok} role="checkbox" aria-checked={checked}
                        onClick={() => { setTemplateIds((ids) => ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]); setUnresolved([]); }}
                        className={`w-full text-left border rounded-[6px] px-4 py-3.5 flex gap-3.5 items-center transition-colors ${checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted'} ${!ok ? 'bg-muted/50 cursor-not-allowed' : ''}`}>
                        <Checkbox checked={checked} disabled={!ok} className="h-5 w-5 pointer-events-none" tabIndex={-1} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium break-words ${!ok ? 'text-muted-foreground' : ''}`}>{t.name}</span>
                          {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className={footer}>
              <span className="text-sm text-muted-foreground">{plural(templateIds.length, 'documento selecionado', 'documentos selecionados')}</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={reset}>Cancelar</Button>
                <Button disabled={!templateIds.length || busy} onClick={prepare}>{busy ? 'Preparando…' : 'Continuar'}</Button>
              </div>
            </div>
          </>
        )}

        {step === 'data' && (
          <>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
              <div className="flex-1 min-w-0 md:overflow-y-auto scrollbar-hide px-6 md:px-9 py-8 space-y-7">
                <div><h3 className="text-lg font-semibold">Dados e signatários</h3>
                  <p className="text-sm text-muted-foreground mt-1">Confira as informações preenchidas automaticamente antes de revisar os documentos.</p></div>
                {pending && (
                  <div className="rounded-[6px] bg-warning/10 p-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <p className="text-sm font-semibold text-warning flex items-center gap-2"><WarningCircle className="h-4 w-4" />{pending.title}</p>
                      <ul className="text-sm text-warning list-disc pl-11">{pending.items.map((i) => <li key={i}>{i}</li>)}</ul>
                    </div>
                    {pending.contactId && <Button size="sm" variant="outline" className="h-8 bg-background" onClick={() => window.open(`/contacts/${pending.contactId}`, '_blank', 'noopener')}>Abrir contato</Button>}
                  </div>
                )}
                {draft && (
                  <section className="space-y-4">
                    <p className="text-xs font-semibold">Dados preenchidos pelo CRM</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                      <Field label="Nome" value={client.name} />
                      <Field label="CPF" value={custom.cpf} />
                      <Field label="Telefone" value={client.phone} />
                      <Field label="E-mail" value={client.email} />
                      <Field label="Endereço" value={custom.Endereco} />
                      <Field label="Bairro" value={custom.Bairro} />
                      <Field label="Cidade / UF" value={cityUf} />
                      <Field label="CEP" value={custom.CEP} />
                      {CUSTOM_CLIENT.slice(1).map(([k, l]) => <Field key={k} label={l} value={custom[k]} />)}
                      {CUSTOM_DEAL.map(([k, l]) => <Field key={k} label={l} value={custom[k]} />)}
                    </div>
                  </section>
                )}
                {unresolved.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-xs font-semibold">Informe os signatários que faltam</p>
                    {unresolved.map((u) => (
                      <div key={u.ref} className="grid sm:grid-cols-2 gap-2">
                        <div><Label className="text-xs">{u.display_name} — nome</Label>
                          <Input value={signers[u.ref]?.name ?? ''} maxLength={200} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], name: e.target.value, email: s[u.ref]?.email ?? '' } }))} /></div>
                        <div><Label className="text-xs">E-mail</Label>
                          <Input type="email" value={signers[u.ref]?.email ?? ''} maxLength={255} onChange={(e) => setSigners((s) => ({ ...s, [u.ref]: { ...s[u.ref], email: e.target.value, name: s[u.ref]?.name ?? '' } }))} /></div>
                      </div>
                    ))}
                  </section>
                )}
              </div>
              <aside className="md:w-[340px] shrink-0 border-t md:border-t-0 md:border-l border-border px-7 py-8 md:overflow-y-auto scrollbar-hide">
                <p className="text-xs font-semibold pb-3 border-b border-border">Signatários</p>
                {!draftParts.length && <p className="text-sm text-muted-foreground py-4">—</p>}
                <ul className="divide-y divide-border border-b border-border">
                  {draftParts.map((p) => (
                    <li key={p.ref} className="py-4">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      <p className="text-xs text-muted-foreground mt-2">Assina {plural(docsForParticipant(p.ref), 'documento', 'documentos')}</p>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
            <div className={footer}>
              <Button variant="ghost" onClick={() => { setStep('template'); setDraft(null); setPending(null); }}>Voltar</Button>
              <div className="flex flex-wrap items-center gap-4">
                {pending && <span className="text-xs text-warning">Corrija as pendências no CRM para enviar</span>}
                {draft
                  ? <Button onClick={() => { setDocTab(0); setStep('preview'); }}>Continuar</Button>
                  : <Button disabled={busy || !templateIds.length} onClick={prepare}>{busy ? 'Preparando…' : pending ? 'Continuar' : 'Preencher novamente'}</Button>}
              </div>
            </div>
          </>
        )}

        {step === 'preview' && draft && (
          <>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              <aside className="md:w-[240px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border bg-muted/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground px-2 pb-3">Documentos</p>
                {draftDocs.length > 1 && (
                  <select className="md:hidden w-full h-9 rounded-[6px] border border-input bg-background px-2 text-sm" value={docTab} onChange={(e) => setDocTab(Number(e.target.value))}>
                    {draftDocs.map((d, i) => <option key={d.ref ?? i} value={i}>{d.title}</option>)}
                  </select>
                )}
                <div className="hidden md:flex flex-col gap-1">
                  {draftDocs.map((d, i) => (
                    <button key={d.ref ?? i} type="button" onClick={() => setDocTab(i)}
                      className={`text-left rounded-[6px] px-3 py-2.5 text-sm border flex items-center gap-2 transition-colors ${i === docTab ? 'bg-background border-border text-foreground' : 'border-transparent text-muted-foreground hover:bg-background'}`}>
                      <FileText className="h-4 w-4 shrink-0" /><span className="truncate">{d.title}</span>
                    </button>
                  ))}
                </div>
                <div className="hidden md:block mt-auto pt-4 border-t border-border px-2 space-y-3">
                  {draftParts.map((p) => (
                    <div key={p.ref}><p className="text-xs text-muted-foreground">Signatário</p>
                      <p className="text-sm font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
                  ))}
                </div>
              </aside>
              <FrozenDocumentPreview frozen={draftDocs[docTab]?.frozen_content} resetKey={`${draft.request_id}:${docTab}`} />
            </div>
            <div className={footer}>
              <Button variant="ghost" onClick={() => setStep('data')}>Voltar</Button>
              <Button disabled={busy} onClick={() => send(draft.request_id)}>{busy ? 'Enviando…' : `Enviar ${plural(draftDocs.length, 'documento', 'documentos')} para assinatura`}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Esconde descrições técnicas (UUID ou código sem espaço com ':'/'-', ex.: qa-legacy-copy-of:<uuid>). Só apresentação.
function isFriendlyDescription(d: unknown): d is string {
  if (typeof d !== 'string' || !d.trim()) return false;
  const s = d.trim();
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s)) return false;
  if (!/\s/.test(s) && /[:\-_]/.test(s)) return false;
  return true;
}
