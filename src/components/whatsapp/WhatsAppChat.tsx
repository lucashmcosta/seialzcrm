import { useState, useEffect, useRef } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Clock, Check, CheckCheck, AlertCircle, Image, FileText, Volume2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { WhatsAppTemplateSelector } from './WhatsAppTemplateSelector';
import { AudioRecorder } from './AudioRecorder';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { MediaUploadButton } from './MediaUploadButton';

interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
  whatsapp_status: string | null;
  whatsapp_message_sid: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_code: string | null;
  error_message: string | null;
}

interface WhatsAppChatProps {
  contactId: string;
  threadId?: string | null;
  onThreadCreated?: (threadId: string) => void;
}

export function WhatsAppChat({ contactId, threadId: initialThreadId, onThreadCreated }: WhatsAppChatProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId || null);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  useEffect(() => {
    fetchThread();
  }, [contactId, organization?.id]);

  useEffect(() => {
    if (!threadId) return;

    // Set up realtime subscription
    const channel = supabase
      .channel(`whatsapp-messages-${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        scrollToBottom();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchThread = async () => {
    if (!organization?.id || !contactId) {
      setLoading(false);
      return;
    }

    try {
      const { data: thread } = await supabase
        .from('message_threads')
        .select('id, whatsapp_last_inbound_at')
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .maybeSingle();

      if (thread) {
        setThreadId(thread.id);
        onThreadCreated?.(thread.id);
        
        // Check 24h window
        if (thread.whatsapp_last_inbound_at) {
          const lastInbound = new Date(thread.whatsapp_last_inbound_at);
          const now = new Date();
          const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
          setIsIn24hWindow(hoursDiff < 24);
        }

        await fetchMessages(thread.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching thread:', error);
      setLoading(false);
    }
  };

  const fetchMessages = async (thread: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', thread)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) || []);
      scrollToBottom();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadMediaToStorage = async (file: File): Promise<{ url: string; mediaType: string }> => {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${organization?.id}/${fileName}`;

    // Determine media type
    let mediaType = 'document';
    if (file.type.startsWith('image/')) {
      mediaType = 'image';
    } else if (file.type.startsWith('audio/')) {
      mediaType = 'audio';
    } else if (file.type.startsWith('video/')) {
      mediaType = 'video';
    }

    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    return { url: publicUrl, mediaType };
  };

  const handleSendMessage = async (mediaUrl?: string, mediaType?: string) => {
    if (!organization?.id || (!messageText.trim() && !mediaUrl)) return;

    if (!isIn24hWindow && !mediaUrl) {
      setShowTemplates(true);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId,
          threadId,
          message: messageText || (mediaUrl ? '📎 Mídia' : ''),
          mediaUrl,
          mediaType,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.requiresTemplate) {
          setShowTemplates(true);
          toast({
            description: 'Fora da janela de 24h. Selecione um template aprovado.',
          });
          return;
        }
        throw new Error(data.error);
      }

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        onThreadCreated?.(data.threadId);
      }

      setMessageText('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mensagem' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!organization?.id) return;

    setSubmitting(true);
    setShowTemplates(false);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId,
          threadId,
          templateId,
          templateVariables: variables,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        onThreadCreated?.(data.threadId);
      }

      toast({ description: 'Mensagem enviada com sucesso!' });
    } catch (error: any) {
      console.error('Error sending template:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar template' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!organization?.id) return;

    try {
      const { url, mediaType } = await uploadMediaToStorage(file);
      await handleSendMessage(url, mediaType);
      toast({ description: 'Mídia enviada com sucesso!' });
    } catch (error: any) {
      console.error('Error uploading media:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mídia' });
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!organization?.id) return;

    try {
      // Convert blob to file
      const audioFile = new File([audioBlob], `audio-${Date.now()}.ogg`, { type: audioBlob.type });
      const { url, mediaType } = await uploadMediaToStorage(audioFile);
      await handleSendMessage(url, 'audio');
      toast({ description: 'Áudio enviado com sucesso!' });
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar áudio' });
    }
  };

  const renderStatusIcon = (status: string | null) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-muted-foreground" />;
      case 'sent':
        return <Check className="w-3 h-3 text-muted-foreground" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-destructive" />;
      default:
        return null;
    }
  };

  const renderMediaContent = (message: Message) => {
    if (!message.media_urls || message.media_urls.length === 0) return null;

    const mediaType = message.media_type;

    return (
      <div className="mb-2 space-y-2">
        {message.media_urls.map((url, i) => {
          // Check if it's audio
          if (mediaType === 'audio' || url.includes('.ogg') || url.includes('.mp3') || url.includes('.wav')) {
            return <AudioMessagePlayer key={i} src={url} />;
          }

          // Check if it's an image
          if (mediaType === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
              <img
                key={i}
                src={url}
                alt="Media"
                className="max-w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(url, '_blank')}
              />
            );
          }

          // Document/other
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background/80 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span className="text-sm underline">Ver documento</span>
            </a>
          );
        })}
      </div>
    );
  };

  const getMediaTypeIcon = (mediaType: string | null) => {
    switch (mediaType) {
      case 'image':
        return <Image className="w-3 h-3" />;
      case 'audio':
        return <Volume2 className="w-3 h-3" />;
      case 'document':
        return <FileText className="w-3 h-3" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (showTemplates) {
    return (
      <WhatsAppTemplateSelector
        onSelect={handleSendTemplate}
        onCancel={() => setShowTemplates(false)}
        loading={submitting}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 24h Window Warning */}
      {!isIn24hWindow && messages.length > 0 && (
        <Alert className="mb-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <Clock className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-orange-700 dark:text-orange-300">
            Fora da janela de 24h. Você precisará usar um template aprovado para iniciar a conversa.
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-[200px] max-h-[400px]">
        <div className="space-y-3 p-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <p className="text-sm">Nenhuma mensagem WhatsApp</p>
              <p className="text-xs">Envie uma mensagem para iniciar a conversa</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOutbound = message.direction === 'outbound';
              return (
                <div
                  key={message.id}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      isOutbound
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                        : 'bg-muted'
                    }`}
                  >
                    {/* Media */}
                    {renderMediaContent(message)}

                    {/* Content */}
                    {message.content && (
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    )}

                    {/* Error */}
                    {message.error_message && (
                      <p className="text-xs text-destructive mt-1">{message.error_message}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {message.media_type && getMediaTypeIcon(message.media_type)}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.sent_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                      {isOutbound && renderStatusIcon(message.whatsapp_status)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="pt-4 border-t mt-4">
        {isIn24hWindow || messages.length === 0 ? (
          <div className="flex gap-2">
            <div className="flex gap-1">
              <MediaUploadButton onUpload={handleMediaUpload} disabled={submitting} />
              <AudioRecorder onSend={handleAudioSend} disabled={submitting} />
            </div>
            <Textarea
              placeholder="Digite uma mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={2}
              className="flex-1 resize-none"
            />
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => handleSendMessage()}
                disabled={submitting || !messageText.trim()}
                size="icon"
                className="bg-green-600 hover:bg-green-700"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowTemplates(true)}
                title="Usar template"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="7" y1="8" x2="17" y2="8" />
                  <line x1="7" y1="12" x2="14" y2="12" />
                  <line x1="7" y1="16" x2="11" y2="16" />
                </svg>
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowTemplates(true)}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="7" y1="8" x2="17" y2="8" />
              <line x1="7" y1="12" x2="14" y2="12" />
              <line x1="7" y1="16" x2="11" y2="16" />
            </svg>
            Selecionar Template
          </Button>
        )}
      </div>
    </div>
  );
}
