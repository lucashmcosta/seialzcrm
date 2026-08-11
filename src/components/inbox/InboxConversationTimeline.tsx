import { useEffect, useRef, useState } from 'react';
import { SpinnerGap, FileText, ArrowBendUpLeft, Paperclip, Plus, Check } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useInboxThreadMessages, type InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';
import { Button } from '@/components/ui/button';
import { AttachMediaDialog, type AttachMedia, type AttachOpportunity } from '@/components/documents/AttachMediaDialog';
import { isAttachableMedia } from '@/lib/mediaToFile';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { WhatsAppFormattedText } from '@/components/whatsapp/WhatsAppFormattedText';
import { MetaRichMessageContent } from '@/components/messages/MetaRichMessageContent';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { MessageStatusIndicator, MessageFailureInline } from '@/components/whatsapp/MessageStatusIndicator';
import { getProxiedMediaUrl } from '@/lib/mediaProxy';
import { DateSeparator } from '@/components/messages/DateSeparator';
import { shouldShowDateSeparator } from '@/lib/dateSeparator';
import { formatEndpointMigrationAuditLine, type EndpointDisplayInfo } from '@/lib/whatsappEndpointDisplay';

interface Props {
  threadId: string;
  organizationId: string | undefined;
  contactId?: string | null;
  contactName?: string;
  currentEndpoint?: EndpointDisplayInfo | null;
  onReply?: (msg: InboxMessageRow) => void;
}

function StatusIcon({ msg }: { msg: InboxMessageRow }) {
  return (
    <MessageStatusIndicator
      status={msg.whatsapp_status}
      errorCode={msg.error_code}
      errorMessage={msg.error_message}
      sentAt={msg.sent_at}
      iconClassName="opacity-70"
    />
  );
}

function Media({ msg, orgId, accessToken }: { msg: InboxMessageRow; orgId: string | undefined; accessToken: string | undefined }) {
  if (!msg.media_urls || msg.media_urls.length === 0) return null;
  const mediaType = msg.media_type;
  const isOutbound = msg.direction === 'outbound';
  const isAudioOnly = mediaType === 'audio';

  return (
    <div className="space-y-2">
      {msg.media_urls.map((raw, i) => {
        const url = getProxiedMediaUrl(raw, orgId, accessToken);
        if (mediaType === 'audio' || /\.(ogg|oga|opus|mp3|mpeg|wav|m4a|aac|amr|webm)(\?|$)/i.test(raw)) {
          return (
            <AudioMessagePlayer
              key={i}
              src={url}
              messageId={msg.id}
              threadId={msg.thread_id}
              mediaType={msg.media_type}
              timestamp={isAudioOnly ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined}
              statusIcon={isAudioOnly && isOutbound ? <StatusIcon msg={msg} /> : undefined}
            />
          );
        }
        if (mediaType === 'video' || /\.(mp4|mov|webm|avi)$/i.test(raw)) {
          return <video key={i} src={url} controls preload="metadata" className="max-w-full rounded-lg" />;
        }
        if (mediaType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(raw)) {
          return (
            <img
              key={i}
              src={url}
              alt="Mídia"
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              onClick={() => window.open(url, '_blank')}
            />
          );
        }
        return (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background/80 text-xs">
            <FileText className="w-4 h-4" /> <span className="underline">Ver documento</span>
          </a>
        );
      })}
    </div>
  );
}

export function InboxConversationTimeline({ threadId, organizationId, contactId, contactName, currentEndpoint, onReply }: Props) {
  const { messages, loading, error } = useInboxThreadMessages(threadId);
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Vincular mídia recebida como documento (triagem inline), igual ao Comercial.
  const [attach, setAttach] = useState<{ pages: AttachMedia[] } | null>(null);
  const [attachPicking, setAttachPicking] = useState(false);
  const [justLinked, setJustLinked] = useState<Record<string, string>>({}); // url → tipo (feedback imediato)
  const [opportunities, setOpportunities] = useState<AttachOpportunity[]>([]);
  const mediaToAttach = (m: InboxMessageRow): AttachMedia => ({
    url: m.media_urls![0],
    mediaType: m.media_type,
    fileName: null,
    label: `${m.media_type === 'image' ? 'Imagem' : 'Documento'} · ${new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token));
  }, []);

  // Oportunidades abertas do contato (destino possível ao vincular).
  useEffect(() => {
    if (!organizationId || !contactId) { setOpportunities([]); return; }
    (async () => {
      const { data } = await supabase.from('opportunities')
        .select('id, title')
        .eq('organization_id', organizationId).eq('contact_id', contactId)
        .eq('status', 'open').is('deleted_at', null);
      setOpportunities((data as AttachOpportunity[]) || []);
    })();
  }, [organizationId, contactId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, threadId]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-destructive p-4 text-center">
        Falha ao carregar mensagens: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
        <div className="max-w-3xl mx-auto w-full space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-16">
            Sem mensagens nesta conversa.
          </div>
        ) : (
          messages.map((m, idx) => {
            const isOutbound = m.direction === 'outbound';
            const isAudioOnly = m.media_type === 'audio';
            const isMediaPlaceholder = !!m.content && /^\[(Áudio|Imagem|Vídeo|Documento|Sticker)\]$/.test(m.content);
            const isInternal = !!m.is_internal_note;
            const timeStr = new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            let senderLabel: string | null = null;
            if (isInternal) {
              senderLabel = `Nota interna${m.sender_name ? ` · ${m.sender_name}` : ''}`;
            } else if (isOutbound) {
              if (m.sender_type === 'agent') senderLabel = `Agente IA${m.sender_name ? ` · ${m.sender_name}` : ''}`;
              else if (m.sender_type === 'user') senderLabel = `Atendente${m.sender_name ? ` · ${m.sender_name}` : ''}`;
              else senderLabel = 'Empresa';
            } else {
              senderLabel = contactName || 'Cliente';
            }

            // Group consecutive same-sender messages within 2 min
            const prev = messages[idx - 1];
            const groupedWithPrev = prev
              && !isInternal
              && !prev.is_internal_note
              && prev.direction === m.direction
              && (prev.sender_name || '') === (m.sender_name || '')
              && (new Date(m.sent_at).getTime() - new Date(prev.sent_at).getTime()) < 2 * 60 * 1000;

            const showDateSep = shouldShowDateSeparator(m.sent_at, prev?.sent_at);
            const dateSep = showDateSep ? <DateSeparator key={`sep-${m.id}`} date={new Date(m.sent_at)} /> : null;

            if (isInternal) {
              const migrationAuditLine = formatEndpointMigrationAuditLine(m.metadata, currentEndpoint);
              return (
                <div key={m.id}>
                  {dateSep}
                  <div className={`w-full ${groupedWithPrev ? 'mt-1' : 'mt-2'}`}>
                  <div className="w-full rounded-lg border-l-[3px] border-amber-400 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-data text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-0.5">
                        Nota interna{m.sender_name ? ` · ${m.sender_name}` : ''}
                      </div>
                      {m.content && (
                        <div className="text-sm text-amber-900 dark:text-amber-100 leading-snug whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      )}
                      {migrationAuditLine && (
                        <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          {migrationAuditLine}
                        </div>
                      )}
                    </div>
                    <span className="font-data text-[10px] text-amber-700/70 dark:text-amber-300/70 flex-shrink-0 mt-0.5">
                      {timeStr}
                    </span>
                  </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id}>
                {dateSep}
                <div className={`group flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-2'}`}>
                {senderLabel && !groupedWithPrev && (
                  <span className="text-[11px] text-muted-foreground mb-1 px-1">
                    {senderLabel}
                  </span>
                )}
                <div className={`flex items-center gap-1 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className={`max-w-[78%] ${isAudioOnly ? 'p-1' : 'px-3.5 py-2'} ${
                      isOutbound
                        ? 'rounded-2xl bg-primary text-primary-foreground shadow-sm'
                        : 'rounded-2xl bg-card text-foreground border border-border shadow-sm'
                    }`}
                  >
                    {m.reply_to_message && (
                      <QuotedMessage
                        content={m.reply_to_message.content || ''}
                        direction={m.reply_to_message.direction || 'inbound'}
                      />
                    )}

                    <Media msg={m} orgId={organizationId} accessToken={accessToken} />

                    {/* Triagem inline: vincular mídia recebida (imagem/PDF) como documento */}
                    {!isOutbound && contactId && isAttachableMedia(m.media_type) && m.media_urls?.[0] && (() => {
                      const thisUrl = m.media_urls[0];
                      const already = attach?.pages.some((p) => p.url === thisUrl);
                      const linkedName = (m.metadata as any)?.attached_document?.type_name ?? justLinked[thisUrl];
                      if (!attachPicking && linkedName) {
                        return <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check size={13} /> Vinculado{linkedName ? ` · ${linkedName}` : ''}</span>;
                      }
                      if (attachPicking) {
                        return (
                          <button type="button"
                            onClick={() => { if (!already && attach) setAttach({ pages: [...attach.pages, mediaToAttach(m)] }); setAttachPicking(false); }}
                            className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${already ? 'text-emerald-600' : 'text-primary hover:underline'}`}>
                            {already ? <><Check size={13} /> Já adicionada</> : <><Plus size={13} /> Adicionar esta página</>}
                          </button>
                        );
                      }
                      return (
                        <button type="button"
                          onClick={() => { setAttach({ pages: [mediaToAttach(m)] }); setAttachPicking(false); }}
                          className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                          <Paperclip size={13} /> Vincular como documento
                        </button>
                      );
                    })()}

                    {m.content && !isAudioOnly && !isMediaPlaceholder && (
                      <MetaRichMessageContent
                        metadata={m.metadata}
                        content={m.content}
                        isOutbound={isOutbound}
                        fallback={(c) => (
                          <WhatsAppFormattedText content={c} className={isOutbound ? 'text-primary-foreground' : ''} />
                        )}
                      />
                    )}

                    {!isAudioOnly && (
                      <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        <span>{timeStr}</span>
                        {isOutbound && <StatusIcon msg={m} />}
                      </div>
                    )}
                    {isOutbound && m.whatsapp_status === 'failed' && (
                      <MessageFailureInline errorCode={m.error_code} className={isOutbound ? 'text-destructive/90' : ''} />
                    )}
                  </div>
                  {onReply && (
                    <button
                      type="button"
                      onClick={() => onReply(m)}
                      className="p-1.5 md:p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Responder"
                      aria-label="Responder"
                    >
                      <ArrowBendUpLeft size={15} />
                    </button>
                  )}
                </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>

      {attach && contactId && organizationId && (
        <AttachMediaDialog
          open={!!attach && !attachPicking}
          onOpenChange={(o) => { if (!o) { setAttach(null); setAttachPicking(false); } }}
          organizationId={organizationId}
          contactId={contactId}
          contactName={contactName}
          opportunities={opportunities}
          pages={attach.pages}
          onPagesChange={(p) => setAttach({ pages: p })}
          onPickMore={() => setAttachPicking(true)}
          onAttached={async (info) => {
            const urls = new Set(info.sourceUrls);
            const linked = { type_name: info.typeName, at: new Date().toISOString() };
            setJustLinked((prev) => ({ ...prev, ...Object.fromEntries(info.sourceUrls.map((u) => [u, info.typeName])) }));
            const targets = (messages as InboxMessageRow[]).filter((m) => m.media_urls?.[0] && urls.has(m.media_urls[0]));
            await Promise.all(targets.map((m) =>
              supabase.from('messages').update({ metadata: { ...((m.metadata as any) || {}), attached_document: linked } }).eq('id', m.id),
            ));
          }}
        />
      )}
      {attach && attachPicking && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-background shadow-lg px-4 py-2">
          <span className="text-sm">Toque em <strong>“Adicionar esta página”</strong> na foto desejada · {attach.pages.length} {attach.pages.length === 1 ? 'página' : 'páginas'}</span>
          <Button size="sm" onClick={() => setAttachPicking(false)}>Voltar ao documento</Button>
        </div>
      )}
    </div>
  );
}
