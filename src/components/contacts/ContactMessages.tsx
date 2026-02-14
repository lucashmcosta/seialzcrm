import { useState, useEffect, useRef } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/base/badges/badges';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { useAI } from '@/hooks/useAI';
import { Loader2, Send, Clock, Check, CheckCheck, AlertCircle, Bot, Sparkles, SpellCheck, Briefcase, Smile, FileText } from 'lucide-react';
import { FaceSmile } from '@untitledui/icons';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { WhatsAppFormattedText } from '@/components/whatsapp/WhatsAppFormattedText';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
  whatsapp_status: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_message: string | null;
  sender_type: 'user' | 'agent' | 'system' | null;
  sender_name: string | null;
  sender_agent_id: string | null;
}

interface ContactMessagesProps {
  contactId?: string;
  opportunityId?: string;
}

export function ContactMessages({ contactId, opportunityId }: ContactMessagesProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(contactId || null);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [aiImproving, setAiImproving] = useState(false);
  const [textareaOverflow, setTextareaOverflow] = useState(false);

  const { generate: generateAI } = useAI();
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  // Check if organization has AI enabled
  const { data: hasAI } = useQuery({
    queryKey: ['org-has-ai', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return false;
      
      const { data } = await supabase
        .from('organization_integrations')
        .select('is_enabled, integration:admin_integrations!inner(slug)')
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .in('integration.slug', ['claude-ai', 'openai-gpt']);
      
      return data && data.length > 0;
    },
    enabled: !!organization?.id,
  });

  useEffect(() => {
    fetchThread();
  }, [contactId, opportunityId, organization?.id]);

  // Real-time subscription
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`contact-whatsapp-messages-${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages((prev) => {
          // Avoid duplicates and remove temp messages
          const filtered = prev.filter(
            (m) => !m.id.startsWith('temp-') && m.id !== newMessage.id
          );
          return [...filtered, newMessage];
        });
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

  // Real-time subscription for thread updates (24h window)
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`contact-thread-updates-${threadId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'message_threads',
        filter: `id=eq.${threadId}`,
      }, (payload) => {
        const updated = payload.new as { whatsapp_last_inbound_at: string | null; last_inbound_at: string | null };
        const lastInboundAt = updated.last_inbound_at || updated.whatsapp_last_inbound_at;
        if (lastInboundAt) {
          const lastInbound = new Date(lastInboundAt);
          const now = new Date();
          const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
          setIsIn24hWindow(hoursDiff < 24);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  // 60s timer to recalculate 24h window
  useEffect(() => {
    if (!threadId) return;
    
    const checkWindow = async () => {
      const { data: thread } = await supabase
        .from('message_threads')
        .select('last_inbound_at, whatsapp_last_inbound_at')
        .eq('id', threadId)
        .single();
      
      if (thread) {
        const lastInboundAt = (thread as any).last_inbound_at || thread.whatsapp_last_inbound_at;
        if (lastInboundAt) {
          const hoursDiff = (Date.now() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60);
          setIsIn24hWindow(hoursDiff < 24);
        }
      }
    };
    
    const interval = setInterval(checkWindow, 60000);
    return () => clearInterval(interval);
  }, [threadId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 130; // ~6 linhas
      
      setTextareaOverflow(scrollHeight > maxHeight);
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  const fetchThread = async () => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }

    // Need either contactId or opportunityId
    if (!contactId && !opportunityId) {
      setLoading(false);
      return;
    }

    try {
      let targetContactId = contactId;

      // If opportunityId is provided, get the contact_id from the opportunity
      if (opportunityId && !contactId) {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('contact_id')
          .eq('id', opportunityId)
          .single();

        if (!opportunity?.contact_id) {
          // No contact linked to this opportunity
          setLoading(false);
          return;
        }

        targetContactId = opportunity.contact_id;
      }

      if (!targetContactId) {
        setLoading(false);
        return;
      }

      // Store the resolved contact ID for use in send functions
      setResolvedContactId(targetContactId);

      const { data: thread } = await supabase
        .from('message_threads')
        .select('id, whatsapp_last_inbound_at, last_inbound_at')
        .eq('organization_id', organization.id)
        .eq('contact_id', targetContactId)
        .eq('channel', 'whatsapp')
        .maybeSingle();

      if (thread) {
        setThreadId(thread.id);
        
        // Check 24h window
        const lastInboundAt = (thread as any).last_inbound_at || thread.whatsapp_last_inbound_at;
        if (lastInboundAt) {
          const lastInbound = new Date(lastInboundAt);
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
        .select('id, content, direction, sent_at, whatsapp_status, media_urls, media_type, error_message, sender_type, sender_name, sender_agent_id')
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

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';
    else if (file.type.startsWith('video/')) mediaType = 'video';

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
    if (!organization?.id || !resolvedContactId || (!messageText.trim() && !mediaUrl)) return;

    if (!isIn24hWindow && !mediaUrl && messages.length > 0) {
      setShowTemplates(true);
      return;
    }

    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: messageText || (mediaUrl ? '📎 Mídia' : ''),
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      whatsapp_status: 'sending',
      media_urls: mediaUrl ? [mediaUrl] : null,
      media_type: mediaType || null,
      error_message: null,
      sender_type: 'user',
      sender_name: userProfile?.full_name || null,
      sender_agent_id: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    const savedText = messageText;
    setMessageText('');
    scrollToBottom();

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: resolvedContactId,
          threadId,
          message: savedText || (mediaUrl ? '📎 Mídia' : ''),
          mediaUrl,
          mediaType,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.requiresTemplate) {
          setShowTemplates(true);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          toast({ description: locale === 'pt-BR' ? 'Fora da janela de 24h. Selecione um template aprovado.' : 'Outside 24h window. Select an approved template.' });
          return;
        }
        throw new Error(data.error);
      }

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mensagem' });
    }
  };

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!organization?.id || !resolvedContactId) return;

    setSubmitting(true);
    setShowTemplates(false);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: resolvedContactId,
          threadId,
          templateId,
          templateVariables: variables,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        await fetchMessages(data.threadId);
      }

      toast({ description: locale === 'pt-BR' ? 'Mensagem enviada!' : 'Message sent!' });
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
    } catch (error: any) {
      console.error('Error uploading media:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mídia' });
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!organization?.id) return;

    try {
      const audioFile = new File([audioBlob], `audio-${Date.now()}.ogg`, { type: audioBlob.type });
      const { url } = await uploadMediaToStorage(audioFile);
      await handleSendMessage(url, 'audio');
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar áudio' });
    }
  };

  const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly') => {
    if (!messageText.trim()) return;

    setAiImproving(true);

    try {
      const result = await generateAI({
        action: 'improve_text',
        context: { text: messageText, mode }
      });

      setMessageText(result.content);
    } catch (error: any) {
      console.error('AI improvement error:', error);
    } finally {
      setAiImproving(false);
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
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

    return (
      <div className="mb-2 space-y-2">
        {message.media_urls.map((url, i) => {
          if (message.media_type === 'audio' || url.match(/\.(ogg|mp3|wav|m4a)$/i)) {
            return <AudioMessagePlayer key={i} src={url} />;
          }
          if (message.media_type === 'video' || url.match(/\.(mp4|mov|webm|avi)$/i)) {
            return (
              <video key={i} src={url} controls className="max-w-full rounded" preload="metadata" />
            );
          }
          if (message.media_type === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
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
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background/80 transition-colors text-sm underline"
            >
              Ver documento
            </a>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Template selector is now a Dialog, not a component replacement

  return (
    <div className="flex flex-col h-[calc(100vh-320px)] min-h-[400px]">
      {/* 24h window warning removed - handled in input area */}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <p className="text-sm">{locale === 'pt-BR' ? 'Nenhuma mensagem WhatsApp' : 'No WhatsApp messages'}</p>
              <p className="text-xs">{locale === 'pt-BR' ? 'Envie uma mensagem para iniciar a conversa' : 'Send a message to start the conversation'}</p>
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
                    className={`max-w-[70%] rounded-lg p-3 ${
                      isOutbound
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                        : 'bg-muted'
                    }`}
                  >
                    {/* Agent Badge */}
                    {isOutbound && message.sender_type === 'agent' && (
                      <div className="flex items-center gap-2 mb-2">
                        <Badge color="purple" size="sm" icon={<Bot className="w-3 h-3" />}>
                          {message.sender_name || 'Agente IA'}
                        </Badge>
                      </div>
                    )}

                    {/* Media */}
                    {renderMediaContent(message)}

                    {/* Content */}
                    {message.content && (
                      <WhatsAppFormattedText content={message.content} />
                    )}

                    {/* Error */}
                    {message.error_message && (
                      <p className="text-xs text-destructive mt-1">{message.error_message}</p>
                    )}

                    {/* Footer - Name + Time + Status */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                        {isOutbound 
                          ? (message.sender_name ? `${message.sender_name} - ` : '')
                          : ''
                        }
                        {new Date(message.sent_at).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
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
        {!isIn24hWindow && messages.length > 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
              <p className="text-sm font-medium">
                {locale === 'pt-BR' ? 'Fora da janela de 24h' : 'Outside 24h window'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {locale === 'pt-BR'
                ? 'Use um template aprovado para reabrir a conversa'
                : 'Use an approved template to reopen the conversation'}
            </p>
            <Button onClick={() => setShowTemplates(true)} size="sm">
              <FileText className="w-4 h-4 mr-2" />
              {locale === 'pt-BR' ? 'Selecionar template' : 'Select template'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex gap-1">
              <MediaUploadButton onFileSelected={handleMediaUpload} onTemplateClick={() => setShowTemplates(true)} disabled={submitting} />
              <AudioRecorder onSend={handleAudioSend} disabled={submitting} />
              
              {/* Emoji Picker */}
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={submitting}>
                    <FaceSmile className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none" align="start" side="top">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    theme={Theme.AUTO}
                    lazyLoadEmojis
                    searchPlaceholder={locale === 'pt-BR' ? 'Buscar emoji...' : 'Search emoji...'}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Textarea
              ref={textareaRef}
              placeholder={locale === 'pt-BR' ? 'Digite uma mensagem...' : 'Type a message...'}
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                  }
                  setTextareaOverflow(false);
                }
              }}
              rows={1}
              className={`flex-1 resize-none min-h-[40px] max-h-[130px] ${
                textareaOverflow ? 'overflow-y-auto scrollbar-hide' : 'overflow-hidden'
              }`}
              disabled={submitting || aiImproving}
            />

            <div className="flex flex-col gap-1">
              {/* AI Improve */}
              {hasAI && messageText.trim() && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" disabled={aiImproving}>
                      {aiImproving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleImproveText('grammar')}>
                      <SpellCheck className="w-4 h-4 mr-2" />
                      {locale === 'pt-BR' ? 'Corrigir gramática' : 'Fix grammar'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImproveText('professional')}>
                      <Briefcase className="w-4 h-4 mr-2" />
                      {locale === 'pt-BR' ? 'Tornar profissional' : 'Make professional'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
                      <Smile className="w-4 h-4 mr-2" />
                      {locale === 'pt-BR' ? 'Tornar amigável' : 'Make friendly'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Send */}
              <Button
                onClick={() => handleSendMessage()}
                disabled={submitting || !messageText.trim() || aiImproving}
                size="icon"
                className="h-9 w-9"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Template Selector Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === 'pt-BR' ? 'Selecionar Template' : 'Select Template'}
            </DialogTitle>
          </DialogHeader>
          <WhatsAppTemplateSelector
            onSelect={handleSendTemplate}
            onCancel={() => setShowTemplates(false)}
            loading={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
