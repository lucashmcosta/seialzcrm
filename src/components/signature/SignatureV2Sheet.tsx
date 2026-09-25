import { useEffect, useMemo, useState } from 'react';
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
import { ArrowClockwise, ArrowLeft, CheckCircle, DownloadSimple, PaperPlaneTilt, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { callSignatureRequests, SignatureApiError, SIGNATURE_STATUS_LABEL, PARTICIPANT_STATUS_LABEL } from '@/lib/signatureRequestsApi';

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

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'completed' ? 'default' : status === 'cancelled' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="font-medium">{SIGNATURE_STATUS_LABEL[status] ?? status}</Badge>;
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
    <div className="flex flex-col min-h-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Solicitações</p>
        {canCreate && <Button size="sm" className="h-8 px-3" onClick={() => { setTemplateIds([]); setSigners({}); setStep('template'); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Novo envio</Button>}
      </div>
      {!canCreate && <p className="text-xs text-muted-foreground">Novos envios usam o fluxo atual. Os envios abaixo continuam acompanháveis.</p>}
      {cap.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!cap.isLoading && requests.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nenhum envio por este fluxo ainda.</p>}
      <div className="flex flex-col gap-1">
        {requests.map((r) => {
          const titles = docTitlesOf(r); const main = participantsOf(r)[0];
          const active = r.id === selectedId;
          return (
            <button key={r.id} type="button" aria-pressed={active} onClick={() => { setSelectedId(r.id); setMobileDetail(true); }}
              className={`relative text-left rounded-[6px] pl-3.5 pr-3 py-2 transition-colors ${active ? 'bg-muted before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary' : 'hover:bg-muted'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{titles.join(' + ')}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{main?.name ?? '—'} · {plural(titles.length, 'documento', 'documentos')}</p>
              <p className="text-xs text-muted-foreground font-data mt-0.5">{fmtDay(relevantDate(r))}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---------- Detalhe ----------
  const detail = (r: any) => {
    const parts = participantsOf(r); const titles = docTitlesOf(r);
    const docs: any[] = r.provider_documents ?? [];
    const done = r.status === 'completed';
    if (r.status === 'draft') {
      return (
        <div className="space-y-5">
          <div className="space-y-1"><StatusBadge status="draft" /><p className="text-lg font-medium pt-2">{titles.join(' + ')}</p>
            <p className="text-sm text-muted-foreground">{parts.map((p) => p.name).join(', ') || '—'}</p>
            <p className="text-xs text-muted-foreground font-data">Criado em {fmt(r.created_at)}</p></div>
          {canCreate && <Button disabled={busy} onClick={() => resumeDraft(r.id)}>Continuar preparação</Button>}
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <StatusBadge status={r.status} />
          <p className="text-lg font-medium pt-2 break-words">{titles.join(' + ')}</p>
          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground font-data">
            {r.sent_at && <span>Enviado em {fmt(r.sent_at)}</span>}
            {r.completed_at && <span>Concluído em {fmt(r.completed_at)}</span>}
            {r.cancelled_at && <span>Cancelado em {fmt(r.cancelled_at)}</span>}
          </div>
        </div>
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Participantes</p>
          <ul className="divide-y divide-border border border-border rounded-[6px]">
            {parts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 flex gap-2">
                  {p.status === 'signed' && <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" weight="fill" />}
                  <div className="min-w-0"><p className="text-sm truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
                </div>
                <div className="text-right text-xs">
                  <p className={p.status === 'signed' ? 'text-foreground' : 'text-muted-foreground'}>{p.status === 'signed' ? 'Assinou' : ['sent', 'in_progress'].includes(r.status) ? 'Aguardando assinatura' : PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}</p>
                  {p.signed_at ? <p className="text-muted-foreground font-data">{fmt(p.signed_at)}</p> : p.opened_at && <p className="text-muted-foreground font-data">Abriu {fmt(p.opened_at)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Documentos</p>
          <ul className="divide-y divide-border border border-border rounded-[6px]">
            {(docs.length ? docs : titles.map((t) => ({ title: t }))).map((d: any, i: number) => {
              const dDone = !!d.final_sha256 || done;
              return (
                <li key={d.document_id ?? i} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex gap-2">
                    {dDone && <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" weight="fill" />}
                    <div className="min-w-0"><p className="text-sm truncate">{d.title ?? 'Documento'}</p>
                      <p className="text-xs text-muted-foreground">{dDone ? 'Concluído' : SIGNATURE_STATUS_LABEL[r.status] ?? r.status}</p></div>
                  </div>
                  {dDone && d.document_id && <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => act('get_download_url', r.id, { document_id: d.document_id })}><DownloadSimple className="h-4 w-4 mr-1" />Baixar</Button>}
                </li>
              );
            })}
          </ul>
        </section>
        {r.provider_operation_id && !['completed', 'cancelled'].includes(r.status) && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => act('get_signature_status', r.id)}><ArrowClockwise className="h-4 w-4 mr-1" />Atualizar</Button>
            {['sent', 'in_progress'].includes(r.status) && <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={busy} onClick={() => act('cancel_signature', r.id)}><X className="h-4 w-4 mr-1" />Cancelar</Button>}
          </div>
        )}
      </div>
    );
  };

  const vars = draft?.snapshot?.variables ?? {};
  const client = vars.client ?? {}; const custom = vars.custom ?? {};
  const cityUf = [custom.Cidade, custom.Estado].filter(Boolean).join(' / ');

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="w-[calc(100vw-16px)] max-w-[1120px] h-[90dvh] max-h-[90dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0 text-left">
          <DialogTitle>Assinatura de contrato</DialogTitle>
          <DialogDescription>Prepare, confira e acompanhe o envio sem sair do Seialz.</DialogDescription>
        </DialogHeader>

        {step === 'list' && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <aside data-sv2="list" className={`${mobileDetail ? 'hidden' : 'flex'} md:flex w-full md:w-[320px] shrink-0 flex-col border-r border-border p-4 overflow-y-auto scrollbar-hide`}>{listCol}</aside>
            <main data-sv2="detail" className={`${mobileDetail ? 'block' : 'hidden'} md:block flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-hide p-6`}>
              <Button variant="ghost" size="sm" className="md:hidden mb-3 -ml-2" onClick={() => setMobileDetail(false)}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
              {selected ? detail(selected) : <p className="text-sm text-muted-foreground">Selecione uma solicitação ou crie um novo envio.</p>}
            </main>
          </div>
        )}

        {step !== 'list' && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
            <div className="p-5 space-y-4">
              {step === 'template' && (
                <div className="space-y-4 max-w-[720px] mx-auto">
                  <div><p className="text-base font-medium">Escolha os documentos</p>
                    <p className="text-xs text-muted-foreground">Os documentos marcados vão juntos em um único envio, com um único link para o cliente.</p></div>
                  {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
                  {templates.error && <p className="text-sm text-destructive">{(templates.error as Error).message}</p>}
                  <div className="flex flex-col gap-2">
                    {(templates.data?.templates ?? []).map((t: any) => {
                      const checked = templateIds.includes(t.id);
                      const item = (
                        <button key={t.id} type="button" disabled={!t.v2_compatible} role="checkbox" aria-checked={checked}
                          onClick={() => { setTemplateIds((ids) => ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]); setUnresolved([]); }}
                          className={`w-full text-left border rounded-[6px] px-4 py-3 flex gap-3 items-start transition-colors ${checked ? 'border-primary bg-muted' : 'border-border hover:bg-muted'} ${!t.v2_compatible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Checkbox checked={checked} disabled={!t.v2_compatible} className="mt-0.5 h-5 w-5 pointer-events-none" tabIndex={-1} />
                          <span className="min-w-0">
                            <span className="block font-medium break-words">{t.name}</span>
                            {t.description && <span className="block text-xs text-muted-foreground">{t.description}</span>}
                            {t.page_count != null && <span className="block text-xs text-muted-foreground">{plural(t.page_count, 'página', 'páginas')}</span>}
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
                </div>
              )}

              {step === 'data' && (
                <div className="space-y-6 max-w-[820px] mx-auto">
                  <div><p className="text-base font-medium">Dados e signatários</p>
                    <p className="text-xs text-muted-foreground">O Seialz preencheu tudo a partir do CRM. Confira antes de ver a prévia.</p></div>
                  {pending && (
                    <div className="border border-destructive/40 bg-muted rounded-[6px] p-4 space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2"><WarningCircle className="h-4 w-4 text-destructive" />{pending.title}</p>
                      <ul className="text-sm text-muted-foreground list-disc pl-5">{pending.items.map((i) => <li key={i}>{i}</li>)}</ul>
                      {pending.contactId && <Button size="sm" variant="outline" onClick={() => window.open(`/contacts/${pending.contactId}`, '_blank', 'noopener')}>Abrir contato</Button>}
                    </div>
                  )}
                  {draft && (
                    <section className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Dados preenchidos pelo CRM</p>
                      <div className="border border-border rounded-[6px] divide-y divide-border">
                        <div className="p-4 space-y-3"><p className="text-sm font-medium">Cliente</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {CLIENT_LABELS.map(([k, l]) => <Field key={k} label={l} value={client[k]} />)}
                            {CUSTOM_CLIENT.map(([k, l]) => <Field key={k} label={l} value={custom[k]} />)}
                          </div></div>
                        {(custom.Endereco || custom.Bairro || cityUf || custom.CEP) && (
                          <div className="p-4 space-y-3"><p className="text-sm font-medium">Endereço</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {CUSTOM_ADDR.slice(0, 2).map(([k, l]) => <Field key={k} label={l} value={custom[k]} />)}
                              <Field label="Cidade / UF" value={cityUf} />
                              <Field label="CEP" value={custom.CEP} />
                            </div></div>
                        )}
                        {CUSTOM_DEAL.some(([k]) => custom[k]) && (
                          <div className="p-4 space-y-3"><p className="text-sm font-medium">Oportunidade</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{CUSTOM_DEAL.map(([k, l]) => <Field key={k} label={l} value={custom[k]} />)}</div></div>
                        )}
                      </div>
                    </section>
                  )}
                  {(draft || unresolved.length > 0) && (
                    <section className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Signatários</p>
                      {draft && (
                        <ul className="divide-y divide-border border border-border rounded-[6px]">
                          {draftParts.map((p) => (
                            <li key={p.ref} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                              <div className="min-w-0"><p className="text-sm truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
                              <span className="text-xs text-muted-foreground">Assina {plural(docsForParticipant(p.ref), 'documento', 'documentos')}</span>
                            </li>
                          ))}
                        </ul>
                      )}
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
              )}

              {step === 'preview' && draft && (
                <div className="md:grid md:grid-cols-[240px_1fr] md:gap-5">
                  <div className="space-y-3 mb-4 md:mb-0">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>{plural(draftDocs.length, 'documento', 'documentos')} · 1 envio</p>
                      <p className="truncate">{draftParts.map((p) => p.name).join(', ')}</p>
                    </div>
                    {draftDocs.length > 1 && (
                      <select className="md:hidden w-full h-9 rounded-[6px] border border-input bg-background px-2 text-sm" value={docTab} onChange={(e) => setDocTab(Number(e.target.value))}>
                        {draftDocs.map((d, i) => <option key={d.ref ?? i} value={i}>{d.title}</option>)}
                      </select>
                    )}
                    <div className="hidden md:flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground">Documentos</p>
                      {draftDocs.map((d, i) => (
                        <button key={d.ref ?? i} type="button" onClick={() => setDocTab(i)}
                          className={`text-left rounded-[6px] px-3 py-2 text-sm border transition-colors ${i === docTab ? 'bg-muted text-foreground border-primary' : 'text-muted-foreground hover:bg-muted border-transparent'}`}>
                          <span className="block truncate">{d.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-4">
                    {previewHtml.map((h: string, i: number) => (
                      <div key={i} className="border border-border rounded-[6px] p-6 bg-card text-sm prose prose-sm max-w-none break-words" dangerouslySetInnerHTML={{ __html: h }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'template' && (
          <div className="shrink-0 border-t border-border px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{plural(templateIds.length, 'documento selecionado', 'documentos selecionados')}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>Voltar</Button>
              <Button disabled={!templateIds.length || busy} onClick={prepare}>{busy ? 'Preparando…' : 'Continuar'}</Button>
            </div>
          </div>
        )}
        {step === 'data' && (
          <div className="shrink-0 border-t border-border px-5 py-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => { setStep('template'); setDraft(null); setPending(null); }}>Voltar</Button>
            {draft
              ? <Button onClick={() => { setDocTab(0); setStep('preview'); }}>Ver prévia</Button>
              : <Button disabled={busy || !templateIds.length} onClick={prepare}>{busy ? 'Preparando…' : 'Preencher novamente'}</Button>}
          </div>
        )}
        {step === 'preview' && draft && (
          <div className="shrink-0 border-t border-border px-5 py-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('data')}>Voltar</Button>
            <Button disabled={busy} onClick={() => send(draft.request_id)}><PaperPlaneTilt className="h-4 w-4 mr-2" />{busy ? 'Enviando…' : `Enviar ${plural(draftDocs.length, 'documento', 'documentos')} para assinatura`}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
