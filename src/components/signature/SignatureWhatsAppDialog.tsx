import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowSquareOut, WhatsappLogo } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';
import { signatureTemplateButton, type TemplateDefinition } from '../../../supabase/functions/_shared/meta-template-components';

type Template = { id: string; friendly_name: string; body: string; footer?: string; components: TemplateDefinition[]; organization_integration_id: string; allowed_purposes: string[] };
type Setting = { organization_integration_id: string; template_id: string; header_image_url: string | null; updated_at: string };
type Context = {
  participant: { id: string; name: string; email: string };
  contacts: { id: string; full_name: string; phone: string }[];
  endpoints: { id: string; display_name: string; external_address: string; purpose: string; organization_integration_id: string }[];
  templates: Template[]; settings: Setting[]; can_configure: boolean;
  last_delivery: { id: string; status: string; created_at: string; message_id: string | null; thread_id: string | null } | null;
  last_sent: { id: string; created_at: string } | null;
};
const selectClass = 'w-full h-10 rounded-md border border-input bg-background px-3 text-sm';

export function SignatureWhatsAppDialog({ requestId, participantId, onClose }: {
  requestId: string; participantId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const queryKey = ['signature-whatsapp', requestId, participantId];
  const context = useQuery({ queryKey, queryFn: () => callSignatureRequests<Context>('get_whatsapp_context', { request_id: requestId, participant_id: participantId }), retry: false, staleTime: 0 });
  const data = context.data;
  const [endpointId, setEndpointId] = useState('');
  const [contactId, setContactId] = useState('');
  const [editing, setEditing] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const deliveryId = useRef(crypto.randomUUID());
  const [resend, setResend] = useState(false);
  const [sent, setSent] = useState<{ thread_id?: string } | null>(null);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    if (!data) return;
    if (!endpointId && data.endpoints.length === 1) setEndpointId(data.endpoints[0].id);
    if (!contactId && data.contacts.length === 1) setContactId(data.contacts[0].id);
  }, [data, endpointId, contactId]);
  const endpoint = data?.endpoints.find(e => e.id === endpointId);
  const setting = data?.settings.find(s => s.organization_integration_id === endpoint?.organization_integration_id);
  const templates = data?.templates.filter(t => t.organization_integration_id === endpoint?.organization_integration_id && t.allowed_purposes.includes(endpoint?.purpose ?? '')) ?? [];
  const template = templates.find(t => t.id === (editing ? templateId : setting?.template_id));
  const button = template ? signatureTemplateButton(template.components) : null;
  const previewImage = editing ? imageUrl : setting?.header_image_url;
  useEffect(() => { setImageFailed(false); }, [previewImage]);
  const last = data?.last_delivery;
  const lastSent = data?.last_sent;
  const pending = last && ['pending', 'unknown'].includes(last.status);
  const ready = !!contactId && !!endpoint && !!setting && !!template && !!button && (!button.hasImage || !!previewImage)
    && !editing && !pending && (!lastSent || resend);
  const payload = { request_id: requestId, participant_id: participantId, endpoint_id: endpointId };
  const save = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await callSignatureRequests('save_whatsapp_settings', { ...payload, template_id: templateId, header_image_url: imageUrl });
      await context.refetch(); setEditing(false); toast.success('Template de assinatura configurado');
    } catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  };
  const send = async () => {
    if (!ready || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await callSignatureRequests<{ thread_id?: string }>('send_whatsapp_link', {
        ...payload, contact_id: contactId, delivery_id: deliveryId.current, settings_updated_at: setting.updated_at,
        resend_of: resend ? lastSent?.id : undefined,
      });
      setSent(result);
      await qc.invalidateQueries({ queryKey: ['signature-capability'] });
    } catch (e) { setError((e as Error).message); await context.refetch(); }
    finally {
      void qc.invalidateQueries({ queryKey: ['signature-whatsapp-summary', requestId] });
      locked.current = false; setBusy(false);
    }
  };
  const startEditing = () => {
    setTemplateId(setting?.template_id ?? (templates.length === 1 ? templates[0].id : ''));
    setImageUrl(setting?.header_image_url ?? ''); setEditing(true); setError('');
  };

  return <Dialog open onOpenChange={open => { if (!open && !locked.current) onClose(); }}>
    <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Enviar assinatura pelo WhatsApp</DialogTitle>
        <DialogDescription>{data ? `${data.participant.name} · ${data.participant.email}` : 'Carregando signatário…'}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto space-y-4">
      {context.isLoading && <p role="status">Carregando…</p>}
      {context.error && <p role="alert" className="text-sm text-destructive">{context.error.message}</p>}
      {sent ? <p role="status" className="text-sm">Mensagem aceita pelo WhatsApp. A entrega pode ser acompanhada na conversa.</p> : data && <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="signature-recipient">Destinatário</Label>
            {data.contacts.length ? <select id="signature-recipient" className={selectClass} value={contactId} onChange={e => setContactId(e.target.value)} disabled={busy}>
              <option value="">Selecione o contato</option>
              {data.contacts.map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.phone}</option>)}
            </select> : <p className="text-sm text-muted-foreground">Cadastre um contato com o telefone e o e-mail deste signatário para enviar.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signature-endpoint">Número de envio</Label>
            <select id="signature-endpoint" className={selectClass} value={endpointId} disabled={busy} onChange={e => { setEndpointId(e.target.value); setEditing(false); setResend(false); setError(''); }}>
              <option value="">Selecione o número</option>
              {data.endpoints.map(ep => <option key={ep.id} value={ep.id}>{ep.display_name} · {ep.external_address}</option>)}
            </select>
            {!data.endpoints.length && <p className="text-sm text-muted-foreground">Nenhum número Meta Cloud disponível no Comercial.</p>}
          </div>
          {endpoint && <div className="space-y-2">
            <Label htmlFor="signature-template">Template de assinatura</Label>
            {editing ? <>
              <select id="signature-template" className={selectClass} value={templateId} onChange={e => setTemplateId(e.target.value)} disabled={busy}>
                <option value="">Selecione o template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.friendly_name}</option>)}
              </select>
              {!templates.length && <p className="text-sm text-muted-foreground">Sincronize e classifique um template aprovado com botão de assinatura SuvSign para este número.</p>}
              {button?.hasImage && <div className="space-y-1.5">
                <Label htmlFor="signature-header-image">Imagem do cabeçalho</Label>
                <Input id="signature-header-image" type="url" placeholder="https://…" value={imageUrl} onChange={e => setImageUrl(e.target.value)} disabled={busy} />
                <p className="text-xs text-muted-foreground">URL pública da imagem. Esta configuração vale para os números desta conta WhatsApp.</p>
              </div>}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !template || (button?.hasImage && !imageUrl.trim())} onClick={save}>Salvar configuração</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            </> : <>
              <p id="signature-template" className="text-sm">{template?.friendly_name ?? 'Nenhum template configurado para este número.'}</p>
              {data.can_configure ? <Button variant="outline" size="sm" onClick={startEditing} disabled={busy}>Configurar template</Button>
                : !template && <p className="text-xs text-muted-foreground">Peça a um administrador para configurar o template desta conta.</p>}
            </>}
          </div>}
          {lastSent && <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={resend} onCheckedChange={v => setResend(v === true)} disabled={busy} />
            <span>Reenviar o link. Último envio em {new Date(lastSent.created_at).toLocaleString('pt-BR')}.</span>
          </label>}
          {pending && <div className="space-y-2">
            <p role="status" className="text-sm text-amber-700">Há um envio aguardando confirmação. Confira a conversa antes de reenviar.</p>
            <Button size="sm" variant="outline" disabled={context.isFetching || busy} onClick={() => context.refetch()}>Atualizar status</Button>
          </div>}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Prévia</p>
          {template && button ? <div className="overflow-hidden rounded-lg border bg-muted/30">
            {button.hasImage && previewImage && <img src={previewImage} alt="Cabeçalho do template de assinatura" className="w-full object-contain max-h-48" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
            {imageFailed && <p className="px-3 pt-3 text-xs text-destructive">Não foi possível carregar a imagem. Confira a URL.</p>}
            <p className="p-3 text-sm whitespace-pre-wrap">{template.body.split(/(\*[^*]+\*)/g).map((part, index) => part.startsWith('*') && part.endsWith('*')
              ? <strong key={index}>{part.slice(1, -1)}</strong> : part)}</p>
            {template.footer && <p className="px-3 pb-3 text-xs text-muted-foreground">{template.footer}</p>}
            <div className="border-t py-2 text-center text-sm text-primary flex justify-center items-center gap-2"><ArrowSquareOut />{button.text}</div>
          </div> : <p className="text-sm text-muted-foreground">Selecione um número com template configurado.</p>}
          {button && <p className="text-xs text-muted-foreground">O botão usará o link individual de {data.participant.name}.</p>}
        </div>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onClose} disabled={busy}>{sent ? 'Fechar' : 'Cancelar'}</Button>
        {!sent && <Button onClick={send} disabled={!ready || busy || context.isFetching || imageFailed}><WhatsappLogo className="h-4 w-4 mr-2" />{busy ? 'Aguarde…' : resend ? 'Reenviar' : 'Enviar'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
