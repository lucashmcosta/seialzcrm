import { useEffect, useRef, useState } from 'react';
import { SpinnerGap, Check, Checks, Clock, WarningCircle, FileText } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useInboxThreadMessages, type InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { WhatsAppFormattedText } from '@/components/whatsapp/WhatsAppFormattedText';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { getProxiedMediaUrl } from '@/lib/mediaProxy';

interface Props {
  threadId: string;
  organizationId: string | undefined;
  contactName?: string;
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
          return <video key={i} src={url} controls preload="metadata" className="max-w-full rounded" />;
        }
        if (mediaType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(raw)) {
          return (
            <img
              key={i}
              src={url}
              alt="Mídia"
              className="max-w-full rounded cursor-pointer hover:opacity-90"
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

export function InboxConversationTimeline({ threadId, organizationId }: Props) {
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-1.5 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="font-data text-[10px] uppercase tracking-wider text-muted-foreground">
          Conversa WhatsApp
        </span>
        <span className="font-data text-[10px] uppercase tracking-wider text-[hsl(var(--sz-t3))]">
          Somente leitura — Fase 1
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 bg-muted/20">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Sem mensagens nesta conversa.
          </div>
        ) : (
          messages.map((m) => {
            const isOutbound = m.direction === 'outbound';
            const isAudioOnly = m.media_type === 'audio' && !m.content;
            const isInternal = !!m.is_internal_note;
            const timeStr = new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={m.id} className={`flex ${isInternal ? 'justify-center' : isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-lg ${isAudioOnly ? 'p-1' : 'p-2.5'} ${
                    isInternal
                      ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border border-amber-300/40'
                      : isOutbound
                        ? 'bg-[#054D3E] text-white'
                        : 'bg-card text-foreground border border-border'
                  }`}
                >
                  {isInternal && (
                    <div className="font-data text-[9px] uppercase tracking-wider mb-1 opacity-80">
                      Nota interna {m.sender_name ? `· ${m.sender_name}` : ''}
                    </div>
                  )}

                  {!isInternal && isOutbound && m.sender_type === 'agent' && (
                    <div className="text-[10px] font-semibold mb-1 opacity-80">
                      {m.sender_name || 'Agente IA'}
                    </div>
                  )}
                  {!isInternal && isOutbound && m.sender_type === 'user' && m.sender_name && (
                    <div className="text-[10px] font-semibold mb-1 opacity-80">
                      {m.sender_name}
                    </div>
                  )}

                  {m.reply_to_message && (
                    <QuotedMessage
                      content={m.reply_to_message.content || ''}
                      direction={m.reply_to_message.direction || 'inbound'}
                    />
                  )}

                  <Media msg={m} orgId={organizationId} accessToken={accessToken} />

                  {m.content && !isAudioOnly && (
                    <WhatsAppFormattedText content={m.content} className={isOutbound && !isInternal ? 'text-white' : ''} />
                  )}

                  {!isAudioOnly && (
                    <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isOutbound && !isInternal ? 'text-white/70' : 'text-muted-foreground'}`}>
                      <span>{timeStr}</span>
                      {isOutbound && !isInternal && <StatusIcon status={m.whatsapp_status} />}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
