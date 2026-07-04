// Phase 1.3D — Full Inbox composer.
// Reuses MediaUploadButton / AudioRecorder / WhatsAppTemplateSelector / ReplyPreview
// from the /messages module. Calls twilio-whatsapp-send with senderContext='inbox'.
// Internal notes are inserted directly via PostgREST (no Twilio call).
//
// Client-side guards mirror server-side guards as defense-in-depth.
// Authoritative guards live in supabase/functions/twilio-whatsapp-send/index.ts.

import { useState } from 'react';
import { dispatchWhatsAppSend } from "@/lib/dispatchWhatsAppSend";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { useAI } from '@/hooks/useAI';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  PaperPlaneTilt,
  LockSimple,
  SpinnerGap,
  Note,
  ChatCircle,
  UserCirclePlus,
  Sparkle,
  TextAa,
  Briefcase,
  Smiley,
  Target,
} from '@phosphor-icons/react';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { audioBlobToFile } from '@/lib/audioBlobToFile';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { ReplyPreview } from '@/components/whatsapp/ReplyPreview';
import { inboxUploadMedia } from '@/lib/inboxMediaUpload';
import type { InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';
import { useServiceWindow } from '@/hooks/useServiceWindow';
import {
  assertTemplateAllowedForEndpoint,
  checkTemplateRateLimit,
  getLowEndpointConfig,
} from '@/lib/complianceGuards';
import { logComplianceBlock } from '@/lib/complianceLog';

interface ThreadLike {
  id: string;
  organization_id: string;
  contact_id: string | null;
  status: string | null;
  assigned_user_id: string | null;
  last_inbound_at?: string | null;
  whatsapp_last_inbound_at?: string | null;
  last_routing_decision?: { action?: string } | null;
  contact?: { lifecycle_stage: string | null; name?: string | null } | null;
  primary_endpoint?: { purpose: string | null; provider?: string | null } | null;
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

const WHATSAPP_MAX_BODY_LENGTH = 1600;

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
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiImproving, setAiImproving] = useState(false);
  const { generate: generateAI } = useAI();

  const { data: hasAIIntegration } = useQuery({
    queryKey: ['org-has-ai-integration', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return false;
      const { data } = await supabase
        .from('organization_integrations')
        .select('id, admin_integrations!inner(slug)')
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .in('admin_integrations.slug', ['openai-gpt', 'claude-ai', 'lovable-ai'])
        .limit(1);
      return !!(data && data.length > 0);
    },
    enabled: !!organization?.id,
  });

  async function handleImproveText(mode: 'grammar' | 'professional' | 'friendly' | 'persuasive') {
    if (!text.trim()) return;
    setAiMenuOpen(false);
    setAiImproving(true);
    try {
      const result = await generateAI({
        action: 'improve_text',
        context: { text, mode },
      });
      if (result?.content) setText(result.content);
    } catch (e) {
      console.error('[inbox-composer] AI improvement error', e);
      toast({ variant: 'destructive', description: 'Erro ao melhorar texto.' });
    } finally {
      setAiImproving(false);
    }
  }

  // Hooks must run unconditionally — compute before guards.
  const lastInboundIso = thread?.last_inbound_at || thread?.whatsapp_last_inbound_at || null;
  const serviceWindow = useServiceWindow({
    contactId: thread?.contact_id ?? null,
    lastInboundAt: lastInboundIso,
  });
  const isIn24hWindow = serviceWindow.isOpen;

  // Provider do endpoint da thread → escolhe filtro de templates.
  // Derivado de forma síncrona do próprio fetch da thread (sem race).
  const endpointProvider = thread?.primary_endpoint?.provider ?? null;
  const endpointId = (thread as any)?.primary_endpoint_id ?? (thread as any)?.primary_endpoint?.id ?? null;
  const templateSelectorProvider: 'twilio' | 'meta_cloud_api' | undefined =
    endpointProvider === 'meta_cloud_api' ? 'meta_cloud_api'
    : endpointProvider === 'twilio' ? 'twilio'
    : undefined;

  // --- Guards ---------------------------------------------------------------

  if (!thread) {
    return <DisabledBar title="Selecione uma conversa para responder." />;
  }

  const lifecycle = thread.contact?.lifecycle_stage ?? null;
  const endpointPurpose = thread.primary_endpoint?.purpose ?? null;
  const status = thread.status ?? null;
  const csIncludesServiceEndpoints = (organization as any)?.cs_inbox_includes_service_endpoints ?? false;
  const lastRoutingAction = thread.last_routing_decision?.action ?? null;

  const passesCustomerRule = lifecycle === 'customer';
  const passesServiceEndpointRule =
    csIncludesServiceEndpoints && endpointPurpose === 'customer_service';
  // Thread iniciada manualmente pelo botão "Nova conversa de Atendimento":
  // libera o guard de lifecycle quando o endpoint é de Atendimento.
  const isManualInboxStart =
    lastRoutingAction === 'inbox_manual_start'
    && (endpointPurpose === 'customer_service' || endpointPurpose === 'other');

  if (!passesCustomerRule && !passesServiceEndpointRule && !isManualInboxStart) {
    return (
      <DisabledBar
        title="Envio bloqueado: contato não é cliente (lifecycle_stage ≠ customer)."
        hint="A Inbox só envia para contatos com lifecycle_stage = customer (ou, se habilitado, threads do endpoint dedicado de Atendimento)."
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
    const { data, error } = await dispatchWhatsAppSend({
        organizationId: thread!.organization_id || organization?.id,
        threadId: thread!.id,
        contactId: thread!.contact_id ?? undefined,
        senderContext: 'inbox',
        userId: myId,
        senderName,
        ...payload,
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
    if (text.length > WHATSAPP_MAX_BODY_LENGTH) {
      toast({
        variant: 'destructive',
        description: `Mensagem muito longa: ${text.length} caracteres. O WhatsApp aceita no máximo ${WHATSAPP_MAX_BODY_LENGTH} por envio. Divida em partes menores ou use um template.`,
      });
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
    const audioFile = audioBlobToFile(blob);
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
    const orgId = thread!.organization_id || organization?.id || null;
    // Guard: template bloqueado no endpoint (regra LOW)
    const endpointBlock = assertTemplateAllowedForEndpoint(templateId, endpointId);
    if (endpointBlock) {
      logComplianceBlock({
        organizationId: orgId,
        blockReason: 'template_blocked_7020_policy',
        endpointId,
        threadId: thread?.id ?? null,
        contactId: thread?.contact_id ?? null,
        templateId,
        attemptedByUserId: myId,
        sourceComponent: 'inbox_composer',
        window: serviceWindow,
      });
      toast({ variant: 'destructive', description: endpointBlock });
      return;
    }
    // Guard: rate limit 1 template / thread / 24h
    const rate = await checkTemplateRateLimit(thread!.id, orgId);
    if (!rate.allowed) {
      logComplianceBlock({
        organizationId: orgId,
        blockReason: 'template_blocked_rate_limit',
        endpointId,
        threadId: thread?.id ?? null,
        contactId: thread?.contact_id ?? null,
        templateId,
        attemptedByUserId: myId,
        sourceComponent: 'inbox_composer',
        window: serviceWindow,
        extra: { last_template_sent_at: rate.lastSentAt },
      });
      toast({ variant: 'destructive', description: rate.reason ?? 'Rate limit atingido.' });
      return;
    }
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

  if (compact) {
    return (
      <div className="border-t border-border bg-background flex-shrink-0 px-2 py-2">
        {replyTo && mode === 'reply' && (
          <div className="mb-2 px-1">
            <ReplyPreview
              message={{ id: replyTo.id, content: replyTo.content || '', direction: replyTo.direction || 'inbound' }}
              onClose={onClearReply}
            />
          </div>
        )}

        <div
          className={`flex items-end gap-1 rounded-full border px-1 py-1 transition-colors ${
            isNote
              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 focus-within:ring-2 focus-within:ring-amber-400/40'
              : 'bg-card border-border focus-within:ring-2 focus-within:ring-ring/30'
          }`}
        >
          {!isNote && (
            <MediaUploadButton
              onFileSelected={handleSendFile}
              onTemplateClick={() => setShowTemplates(true)}
              disabled={inputDisabled}
            />
          )}

          <button
            type="button"
            onClick={() => setMode(isNote ? 'reply' : 'note')}
            className={`h-9 w-9 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
              isNote
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
            title={isNote ? 'Voltar para resposta' : 'Nota interna'}
          >
            <Note size={18} />
          </button>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={inputDisabled}
            className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent px-2 py-2 min-h-[36px] max-h-[120px] text-sm placeholder:text-muted-foreground/60 scrollbar-hide"
          />

          {!isNote && hasAIIntegration && isIn24hWindow && (
            <DropdownMenu open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full flex-shrink-0"
                  disabled={!text.trim() || aiImproving || inputDisabled}
                  title="Melhorar com IA"
                >
                  {aiImproving ? (
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkle className="h-4 w-4 text-purple-500" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleImproveText('grammar')}>
                  <TextAa className="h-4 w-4 mr-2" /> Corrigir gramática
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('professional')}>
                  <Briefcase className="h-4 w-4 mr-2" /> Tornar profissional
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
                  <Smiley className="h-4 w-4 mr-2" /> Tornar amigável
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('persuasive')}>
                  <Target className="h-4 w-4 mr-2" /> Tornar persuasivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isNote && (
            <AudioRecorder onSend={handleSendAudio} disabled={inputDisabled || !isIn24hWindow} />
          )}
          <Button
            onClick={isNote ? handleSaveNote : handleSendText}
            disabled={inputDisabled || !text.trim()}
            size="icon"
            className={`h-9 w-9 rounded-full flex-shrink-0 ${
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

        <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
          <DialogContent className="max-w-2xl h-[80vh] p-0 flex flex-col overflow-hidden">
            <WhatsAppTemplateSelector
              onSelect={handleSendTemplate}
              onCancel={() => setShowTemplates(false)}
              provider={templateSelectorProvider}
              endpointId={endpointId}
              windowIsOpen={isIn24hWindow}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

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

        {/* Caixa unificada compacta (pill) */}
        <div
          className={`flex items-end gap-1 rounded-full border px-1 py-1 transition-colors ${
            isNote
              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 focus-within:ring-2 focus-within:ring-amber-400/40'
              : 'bg-card border-border focus-within:ring-2 focus-within:ring-ring/30'
          }`}
        >
          {!isNote && (
            <MediaUploadButton
              onFileSelected={handleSendFile}
              onTemplateClick={() => setShowTemplates(true)}
              disabled={inputDisabled}
            />
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={inputDisabled}
            className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent px-2 py-2 min-h-[36px] max-h-[120px] text-sm placeholder:text-muted-foreground/60 scrollbar-hide"
          />

          {!isNote && hasAIIntegration && isIn24hWindow && (
            <DropdownMenu open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full flex-shrink-0"
                  disabled={!text.trim() || aiImproving || inputDisabled}
                  title="Melhorar com IA"
                >
                  {aiImproving ? (
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkle className="h-4 w-4 text-purple-500" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleImproveText('grammar')}>
                  <TextAa className="h-4 w-4 mr-2" /> Corrigir gramática
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('professional')}>
                  <Briefcase className="h-4 w-4 mr-2" /> Tornar profissional
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
                  <Smiley className="h-4 w-4 mr-2" /> Tornar amigável
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImproveText('persuasive')}>
                  <Target className="h-4 w-4 mr-2" /> Tornar persuasivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isNote && (
            <AudioRecorder onSend={handleSendAudio} disabled={inputDisabled || !isIn24hWindow} />
          )}
          <Button
            onClick={isNote ? handleSaveNote : handleSendText}
            disabled={inputDisabled || !text.trim()}
            size="icon"
            className={`h-9 w-9 rounded-full flex-shrink-0 ${
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



      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl h-[80vh] p-0 flex flex-col overflow-hidden">
          <WhatsAppTemplateSelector
            onSelect={handleSendTemplate}
            onCancel={() => setShowTemplates(false)}
            loading={submitting}
            provider={templateSelectorProvider}
            endpointId={endpointId}
            windowIsOpen={isIn24hWindow}
          />
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
    message_too_long: `Mensagem muito longa. O WhatsApp aceita no máximo ${WHATSAPP_MAX_BODY_LENGTH} caracteres por envio. Divida em partes menores.`,
  };
  if (map[raw]) return map[raw];
  if (raw.toLowerCase().includes('outside 24h')) {
    return 'Fora da janela 24h. Use um template aprovado.';
  }
  if (raw.includes('21617') || raw.toLowerCase().includes('exceeds the 1600')) {
    return `Mensagem muito longa para o WhatsApp (limite ${WHATSAPP_MAX_BODY_LENGTH} caracteres). Divida em partes menores.`;
  }
  return raw;
}
