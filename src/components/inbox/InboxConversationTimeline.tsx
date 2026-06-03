import { useEffect, useRef, useState } from 'react';
import { SpinnerGap, Check, Checks, Clock, WarningCircle, FileText, ArrowBendUpLeft } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useInboxThreadMessages, type InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { WhatsAppFormattedText } from '@/components/whatsapp/WhatsAppFormattedText';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { getProxiedMediaUrl } from '@/lib/mediaProxy';
import { DateSeparator } from '@/components/messages/DateSeparator';
import { shouldShowDateSeparator } from '@/lib/dateSeparator';

interface Props {
  threadId: string;
  organizationId: string | undefined;
  contactName?: string;
  onReply?: (msg: InboxMessageRow) => void;
}

function StatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case 'sending': return <Clock className="w-3 h-3 opacity-70" />;
    case 'sent': return <Check className="w-3 h-3 opacity-70" />;
    case 'delivered': return <Checks className="w-3 h-3 opacity-70" />;
    case 'read': return <Checks className="w-3 h-3 text-sky-400" />;
    case 'failed': return <WarningCircle className="w-3 h-3 text-destructive" />;
    default: return null;
  }
}

function Media({ msg, orgId, accessToken }: { msg: InboxMessageRow; orgId: string | undefined; accessToken: string | undefined }) {
  if (!msg.media_urls || msg.media_urls.length === 0) return null;
  const mediaType = msg.media_type;
  const isOutbound = msg.direction === 'outbound';
  const isAudioOnly = mediaType === 'audio' && !msg.content;

  return (
    <div className="space-y-2">
      {msg.media_urls.map((raw, i) => {
        const url = getProxiedMediaUrl(raw, orgId, accessToken);
        if (mediaType === 'audio' || /\.(ogg|mp3|wav|m4a)$/i.test(raw)) {
          return (
            <AudioMessagePlayer
              key={i}
              src={url}
              timestamp={isAudioOnly ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined}
              statusIcon={isAudioOnly && isOutbound ? <StatusIcon status={msg.whatsapp_status} /> : undefined}
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

export function InboxConversationTimeline({ threadId, organizationId, contactName, onReply }: Props) {
  const { messages, loading, error } = useInboxThreadMessages(threadId);
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token));
  }, []);

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
            const isAudioOnly = m.media_type === 'audio' && !m.content;
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
                    </div>
                    <span className="font-data text-[10px] text-amber-700/70 dark:text-amber-300/70 flex-shrink-0 mt-0.5">
                      {timeStr}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`group flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-2'}`}>
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

                    {m.content && !isAudioOnly && (
                      <WhatsAppFormattedText content={m.content} className={isOutbound ? 'text-primary-foreground' : ''} />
                    )}

                    {!isAudioOnly && (
                      <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        <span>{timeStr}</span>
                        {isOutbound && <StatusIcon status={m.whatsapp_status} />}
                      </div>
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
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
