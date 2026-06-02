// Phase 1.3D — Full Inbox composer.
// Reuses MediaUploadButton / AudioRecorder / WhatsAppTemplateSelector / ReplyPreview
// from the /messages module. Calls twilio-whatsapp-send with senderContext='inbox'.
// Internal notes are inserted directly via PostgREST (no Twilio call).
//
// Client-side guards mirror server-side guards as defense-in-depth.
// Authoritative guards live in supabase/functions/twilio-whatsapp-send/index.ts.

import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  PaperPlaneTilt,
  LockSimple,
  SpinnerGap,
  Note,
  ChatCircle,
  UserCirclePlus,
} from '@phosphor-icons/react';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { ReplyPreview } from '@/components/whatsapp/ReplyPreview';
import { inboxUploadMedia } from '@/lib/inboxMediaUpload';
import type { InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';

interface ThreadLike {
  id: string;
  organization_id: string;
  contact_id: string | null;
  status: string | null;
  assigned_user_id: string | null;
  last_inbound_at?: string | null;
  whatsapp_last_inbound_at?: string | null;
  contact?: { lifecycle_stage: string | null; name?: string | null } | null;
  primary_endpoint?: { purpose: string | null } | null;
}

interface Props {
  thread: ThreadLike | null;
  replyTo: InboxMessageRow | null;
  onClearReply: () => void;
  onSent?: () => void;
  onThreadMutated?: () => void;
  compact?: boolean;
}

type Mode = 'reply' | 'note';

function DisabledBar({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-t border-border bg-muted/30 px-6 py-3 flex-shrink-0">
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <LockSimple size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
        <div className="leading-tight">
          <p className="text-foreground font-medium">{title}</p>
          {hint ? <p>{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function InboxComposer({ thread, replyTo, onClearReply, onSent, onThreadMutated, compact = false }: Props) {
  const { organization, userProfile } = useOrganization();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('reply');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [takingOver, setTakingOver] = useState(false);

  // Hooks must run unconditionally — compute before guards.
  const lastInboundIso = thread?.last_inbound_at || thread?.whatsapp_last_inbound_at || null;
  const isIn24hWindow = useMemo(() => {
    if (!lastInboundIso) return false;
    const diffMs = Date.now() - new Date(lastInboundIso).getTime();
    return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
  }, [lastInboundIso]);

  // --- Guards ---------------------------------------------------------------

  if (!thread) {
    return <DisabledBar title="Selecione uma conversa para responder." />;
  }

  const lifecycle = thread.contact?.lifecycle_stage ?? null;
  const endpointPurpose = thread.primary_endpoint?.purpose ?? null;
  const status = thread.status ?? null;

  if (lifecycle !== 'customer') {
    return (
      <DisabledBar
        title="Envio bloqueado: contato não é cliente (lifecycle_stage ≠ customer)."
        hint="A Inbox só envia para contatos com lifecycle_stage = customer."
      />
    );
  }
  if (status === 'resolved' || status === 'closed') {
    return (
      <DisabledBar
        title={`Conversa ${status === 'resolved' ? 'resolvida' : 'fechada'}.`}
        hint="Reabra a conversa para voltar a enviar mensagens."
      />
    );
  }
  if (endpointPurpose === 'commercial' || endpointPurpose === 'vendor_personal') {
    return (
      <DisabledBar
        title={`Envio bloqueado: endpoint purpose=${endpointPurpose}.`}
        hint="Este número é de uso comercial/vendedor — fora do escopo de Atendimento."
      />
    );
  }

  // --- Assignment -----------------------------------------------------------

  const myId = userProfile?.id ?? null;
  const assignedToSomeoneElse =
    thread.assigned_user_id !== null && myId !== null && thread.assigned_user_id !== myId;

  async function handleTakeOver() {
    if (!myId || !thread) return;
    setTakingOver(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({
          assigned_user_id: myId,
          assigned_at: new Date().toISOString(),
          last_routing_decision: {
            action: 'take_over',
            by_user_id: myId,
            reason: thread.assigned_user_id ? 'inbox_reassign_to_self' : 'inbox_takeover',
            at: new Date().toISOString(),
          },
        })
        .eq('id', thread.id);
      if (error) throw error;
      onThreadMutated?.();
      toast({ description: 'Conversa atribuída a você.' });
    } catch (e: any) {
      console.error('[inbox-composer] takeover failed', e);
      toast({ variant: 'destructive', description: e?.message || 'Falha ao assumir.' });
    } finally {
      setTakingOver(false);
    }
  }

  // --- Senders --------------------------------------------------------------

  const senderName = userProfile?.full_name || userProfile?.email || 'Atendente';

  async function invokeSend(payload: Record<string, any>) {
    const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
      body: {
        organizationId: thread!.organization_id || organization?.id,
        threadId: thread!.id,
        senderContext: 'inbox',
        userId: myId,
        senderName,
        ...payload,
      },
    });
    if (error) {
      let reason = error.message;
      try {
        const ctx: any = (error as any).context;
        if (ctx?.body) {
          const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
          reason = parsed?.error || reason;
        }
      } catch { /* noop */ }
      throw new Error(reason);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function handleSendText() {
    if (!text.trim()) return;
    if (!isIn24hWindow) {
      setShowTemplates(true);
      return;
    }
    setSubmitting(true);
    try {
      await invokeSend({ message: text, replyToMessageId: replyTo?.id ?? null });
      setText('');
      onClearReply();
      onSent?.();
    } catch (e: any) {
      console.error('[inbox-composer] send failed', e);
      toast({ variant: 'destructive', description: friendlyError(e?.message) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendFile(file: File) {
    if (!organization?.id) return;
    setSubmitting(true);
    try {
      const { url, mediaType } = await inboxUploadMedia(supabase, file, organization.id);
      await invokeSend({
        message: text || '',
        mediaUrl: url,
        mediaType,
        replyToMessageId: replyTo?.id ?? null,
      });
      setText('');
      onClearReply();
      onSent?.();
    } catch (e: any) {
      console.error('[inbox-composer] media send failed', e);
      toast({ variant: 'destructive', description: friendlyError(e?.message) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendAudio(blob: Blob) {
    if (!organization?.id) return;
    const audioFile = new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg;codecs=opus' });
    setSubmitting(true);
    try {
      const { url, mediaType } = await inboxUploadMedia(supabase, audioFile, organization.id);
      await invokeSend({
        message: '',
        mediaUrl: url,
        mediaType,
        replyToMessageId: replyTo?.id ?? null,
      });
      onSent?.();
    } catch (e: any) {
      console.error('[inbox-composer] audio send failed', e);
      toast({ variant: 'destructive', description: friendlyError(e?.message) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendTemplate(templateId: string, variables: Record<string, string>) {
    setSubmitting(true);
    try {
      await invokeSend({ templateId, templateVariables: variables });
      setShowTemplates(false);
      setText('');
      onClearReply();
      onSent?.();
    } catch (e: any) {
      console.error('[inbox-composer] template send failed', e);
      toast({ variant: 'destructive', description: friendlyError(e?.message) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveNote() {
    if (!text.trim() || !thread || !myId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('messages').insert({
        organization_id: thread.organization_id || organization!.id,
        thread_id: thread.id,
        content: text.trim(),
        direction: 'internal',
        is_internal_note: true,
        sender_type: 'user',
        sender_user_id: myId,
        sender_name: senderName,
        sent_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
      setText('');
      onClearReply();
      onSent?.();
      toast({ description: 'Nota interna registrada.' });
    } catch (e: any) {
      console.error('[inbox-composer] note failed', e);
      toast({ variant: 'destructive', description: e?.message || 'Falha ao salvar nota.' });
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'note') handleSaveNote();
      else handleSendText();
    }
  }

  // --- UI -------------------------------------------------------------------

  const inputDisabled = submitting || assignedToSomeoneElse;
  const firstName = (thread.contact?.name || '').split(' ')[0] || 'cliente';

  const placeholder = mode === 'note'
    ? 'Anotação interna visível só para a equipe'
    : isIn24hWindow
      ? `Mensagem para ${firstName}`
      : 'Selecione um template para iniciar';

  const isNote = mode === 'note';

  return (
    <div className="border-t border-border bg-background flex-shrink-0 px-6 pt-3 pb-4">
      <div className="max-w-3xl mx-auto w-full">
        {/* Tabs + ações */}
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setMode('reply')}
            className={`flex items-center gap-1.5 text-xs h-7 px-3 rounded-full transition-colors ${
              mode === 'reply'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <ChatCircle size={13} /> Responder
          </button>
          <button
            type="button"
            onClick={() => setMode('note')}
            className={`flex items-center gap-1.5 text-xs h-7 px-3 rounded-full transition-colors ${
              mode === 'note'
                ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Note size={13} /> Nota interna
          </button>

          <div className="flex-1" />

          {!thread.assigned_user_id && myId && (
            <Button size="sm" variant="outline" onClick={handleTakeOver} disabled={takingOver} className="h-7 text-xs">
              {takingOver ? <SpinnerGap className="w-3 h-3 animate-spin mr-1" /> : <UserCirclePlus size={13} className="mr-1" />}
              Assumir
            </Button>
          )}
          {assignedToSomeoneElse && (
            <Button size="sm" variant="outline" onClick={handleTakeOver} disabled={takingOver} className="h-7 text-xs">
              {takingOver ? <SpinnerGap className="w-3 h-3 animate-spin mr-1" /> : <UserCirclePlus size={13} className="mr-1" />}
              Reatribuir para mim
            </Button>
          )}
        </div>

        {assignedToSomeoneElse && (
          <div className="mb-2 text-[11px] text-muted-foreground">
            Esta conversa está atribuída a outro usuário.
          </div>
        )}

        {replyTo && mode === 'reply' && (
          <div className="mb-2">
            <ReplyPreview
              message={{ id: replyTo.id, content: replyTo.content || '', direction: replyTo.direction || 'inbound' }}
              onClose={onClearReply}
            />
          </div>
        )}

        {/* Caixa unificada */}
        <div
          className={`rounded-2xl border transition-colors ${
            isNote
              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 focus-within:ring-2 focus-within:ring-amber-400/40'
              : 'bg-card border-border focus-within:ring-2 focus-within:ring-ring/30'
          }`}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={inputDisabled}
            className="w-full resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent px-4 pt-3 pb-1 min-h-[44px] max-h-[180px] text-sm placeholder:text-muted-foreground/60"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div className="flex items-center gap-0.5">
              {!isNote && (
                <MediaUploadButton
                  onFileSelected={handleSendFile}
                  onTemplateClick={() => setShowTemplates(true)}
                  disabled={inputDisabled}
                />
              )}
            </div>

            <div className="flex items-center gap-1">
              {!isNote && (
                <AudioRecorder onSend={handleSendAudio} disabled={inputDisabled || !isIn24hWindow} />
              )}
              <Button
                onClick={isNote ? handleSaveNote : handleSendText}
                disabled={inputDisabled || !text.trim()}
                size="icon"
                className={`h-9 w-9 rounded-full ${
                  isNote ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''
                }`}
                title={isNote ? 'Salvar nota interna' : isIn24hWindow ? 'Enviar' : 'Selecionar template'}
              >
                {submitting ? (
                  <SpinnerGap className="w-4 h-4 animate-spin" />
                ) : isNote ? (
                  <Note className="w-4 h-4" />
                ) : (
                  <PaperPlaneTilt className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/70 mt-1.5 px-1">
          Enter envia · Shift+Enter quebra linha
        </p>
      </div>

      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
          <div className="p-2">
            <WhatsAppTemplateSelector
              onSelect={handleSendTemplate}
              onCancel={() => setShowTemplates(false)}
              loading={submitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function friendlyError(raw: string | undefined): string {
  if (!raw) return 'Falha ao enviar.';
  const map: Record<string, string> = {
    not_customer: 'Bloqueado: contato não é cliente.',
    thread_closed: 'Bloqueado: conversa resolvida/fechada.',
    purpose_blocked: 'Bloqueado: endpoint não pode enviar via Inbox.',
    thread_not_found: 'Conversa não encontrada.',
    contact_not_found: 'Contato não encontrado.',
    no_endpoint: 'Conversa sem endpoint configurado.',
    endpoint_inactive: 'Endpoint inativo.',
    integration_missing: 'Integração WhatsApp ausente.',
    sender_data_missing: 'Número remetente inválido.',
    wrong_channel: 'Endpoint não é WhatsApp.',
    missing_thread: 'Conversa não informada.',
    missing_organization: 'Organização não informada.',
    thread_without_contact: 'Conversa sem contato associado.',
  };
  if (map[raw]) return map[raw];
  if (raw.toLowerCase().includes('outside 24h')) {
    return 'Fora da janela 24h. Use um template aprovado.';
  }
  return raw;
}
