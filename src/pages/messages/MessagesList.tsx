import { useState, useEffect, useRef, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  DotsHorizontal,
  FaceSmile,
  PhoneCall01,
  SearchLg,
  Send01,
  Archive,
  User01,
} from '@untitledui/icons';
import { ListBox, ListBoxItem, type ListBoxItemProps } from 'react-aria-components';
import { Layout } from '@/components/Layout';
import { Avatar } from '@/components/base/avatar/avatar';
import { Badge, BadgeWithDot } from '@/components/base/badges/badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { cn } from '@/lib/utils';

// Helper function for formatting relative time
const formatRelativeTime = (timestamp: string, locale: 'pt-BR' | 'en-US'): string => {
  const now = Date.now();
  const date = new Date(timestamp);
  const diffInMinutes = Math.floor((now - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (locale === 'pt-BR') {
    if (diffInMinutes < 1) {
      return 'Agora';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} min atrás`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hora${diffInHours === 1 ? '' : 's'} atrás`;
    } else if (diffInDays === 1) {
      const time = date.toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit', hour12: false });
      return `Ontem ${time}`;
    } else if (diffInDays <= 7) {
      const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      const time = date.toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit', hour12: false });
      return `${dayOfWeek} ${time}`;
    } else {
      return `${diffInDays} dias atrás`;
    }
  } else {
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} mins ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    } else if (diffInDays === 1) {
      const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `Yesterday ${time.toLowerCase()}`;
    } else if (diffInDays <= 7) {
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${dayOfWeek} ${time.toLowerCase()}`;
    } else {
      return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
    }
  }
};

interface ChatThread {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  last_message: string | null;
  last_message_direction: string | null;
  updated_at: string;
  whatsapp_last_inbound_at: string | null;
  unread: boolean;
}

interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
  whatsapp_status: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_message: string | null;
}

interface ChatListItemProps extends ListBoxItemProps<ChatThread> {
  value: ChatThread;
  locale: 'pt-BR' | 'en-US';
}

const ChatListItem = ({ value, locale, className, ...otherProps }: ChatListItemProps) => {
  if (!value) return null;

  return (
    <ListBoxItem
      {...otherProps}
      id={value.id}
      textValue={value.contact_name}
      className={(state) =>
        cn(
          'relative flex flex-col gap-4 border-b border-border py-4 pr-4 pl-3 select-none cursor-pointer',
          state.isFocused && 'outline-2 -outline-offset-2 outline-ring',
          state.isSelected && 'bg-accent',
          typeof className === 'function' ? className(state) : className
        )
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar fallbackText={value.contact_name} size="md" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">
              {value.contact_name}
            </span>
            {value.unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(value.updated_at, locale)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground line-clamp-2 min-w-0">
          {value.last_message_direction === 'outbound' && (
            <span className="font-medium text-foreground">
              {locale === 'pt-BR' ? 'Você: ' : 'You: '}
            </span>
          )}
          {value.last_message || (locale === 'pt-BR' ? 'Nenhuma mensagem' : 'No messages')}
        </p>
      </div>
    </ListBoxItem>
  );
};

export default function MessagesList() {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch threads
  const { data: threads, isLoading: threadsLoading, refetch: refetchThreads } = useQuery({
    queryKey: ['whatsapp-threads', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from('message_threads')
        .select(`
          id,
          contact_id,
          updated_at,
          whatsapp_last_inbound_at,
          contacts!inner(full_name, phone)
        `)
        .eq('organization_id', organization.id)
        .eq('channel', 'whatsapp')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Get last message for each thread
      const threadsWithMessages = await Promise.all(
        (data || []).map(async (thread) => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, direction')
            .eq('thread_id', thread.id)
            .is('deleted_at', null)
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const contact = thread.contacts as any;

          return {
            id: thread.id,
            contact_id: thread.contact_id,
            contact_name: contact?.full_name || 'Desconhecido',
            contact_phone: contact?.phone,
            last_message: lastMsg?.content || null,
            last_message_direction: lastMsg?.direction || null,
            updated_at: thread.updated_at,
            whatsapp_last_inbound_at: thread.whatsapp_last_inbound_at,
            unread: false, // TODO: implement unread tracking
          } as ChatThread;
        })
      );

      return threadsWithMessages;
    },
    enabled: !!organization?.id,
  });

  const selectedThread = threads?.find((t) => t.id === selectedThreadId);

  // Fetch messages when thread selected
  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    }
  }, [selectedThreadId]);

  // Real-time subscription for ALL new messages (updates thread list)
  useEffect(() => {
    if (!organization?.id) return;

    const channel = supabase
      .channel(`org-messages-${organization.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organization.id}`,
      }, (payload) => {
        const newMessage = payload.new as Message & { thread_id: string };
        
        // Refetch threads to update list order and last message
        refetchThreads();
        
        // If this message belongs to the selected thread, add it to messages
        if (newMessage.thread_id === selectedThreadId) {
          setMessages((prev) => {
            // Remove temporary messages and avoid duplicates
            const filtered = prev.filter(
              (m) => !m.id.startsWith('temp-') && m.id !== newMessage.id
            );
            return [...filtered, newMessage];
          });
          scrollToBottom();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organization.id}`,
      }, (payload) => {
        const updatedMessage = payload.new as Message & { thread_id: string };
        
        // Update message if it's in the selected thread
        if (updatedMessage.thread_id === selectedThreadId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, selectedThreadId, refetchThreads]);

  // Real-time subscription for new threads
  useEffect(() => {
    if (!organization?.id) return;

    const channel = supabase
      .channel(`org-threads-${organization.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_threads',
        filter: `organization_id=eq.${organization.id}`,
      }, () => {
        refetchThreads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, refetchThreads]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, direction, sent_at, whatsapp_status, media_urls, media_type, error_message')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) || []);

      // Check 24h window
      const thread = threads?.find((t) => t.id === threadId);
      if (thread?.whatsapp_last_inbound_at) {
        const lastInbound = new Date(thread.whatsapp_last_inbound_at);
        const now = new Date();
        const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
        setIsIn24hWindow(hoursDiff < 24);
      } else {
        setIsIn24hWindow(false);
      }

      scrollToBottom();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!organization?.id || !messageText.trim() || !selectedThread) return;

    if (!isIn24hWindow) {
      setShowTemplates(true);
      return;
    }

    // Optimistic UI: add message immediately
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: messageText,
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      whatsapp_status: 'sending',
      media_urls: null,
      media_type: null,
      error_message: null,
    };

    // Add temp message and clear input immediately
    setMessages((prev) => [...prev, tempMessage]);
    const savedText = messageText;
    setMessageText('');
    scrollToBottom();

    // Send in background (no setSubmitting to keep UI responsive)
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          message: savedText,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.requiresTemplate) {
          // Remove temp message and show templates
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setMessageText(savedText);
          setShowTemplates(true);
          return;
        }
        throw new Error(data.error);
      }

      // Success - real-time will replace temp message with real one
      refetchThreads();
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Mark temp message as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: error.message }
            : m
        )
      );
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mensagem' });
    }
  };

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!organization?.id || !selectedThread) return;

    setShowTemplates(false);

    // Optimistic UI: add template message immediately
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: '📋 Template...',
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      whatsapp_status: 'sending',
      media_urls: null,
      media_type: null,
      error_message: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          templateId,
          templateVariables: variables,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      // Success - real-time will replace temp message
      refetchThreads();
    } catch (error: any) {
      console.error('Error sending template:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: error.message }
            : m
        )
      );
      toast({ variant: 'destructive', description: error.message });
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!organization?.id || !selectedThread) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${organization.id}/${fileName}`;

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';
    else if (file.type.startsWith('video/')) mediaType = 'video';

    // Optimistic UI: add media message immediately
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: mediaType === 'image' ? '📷 Imagem' : mediaType === 'audio' ? '🎵 Áudio' : '📎 Mídia',
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      whatsapp_status: 'sending',
      media_urls: null,
      media_type: mediaType,
      error_message: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();

    try {
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(filePath);

      const { error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          message: '📎 Mídia',
          mediaUrl: publicUrl,
          mediaType,
          userId: userProfile?.id,
        },
      });

      if (error) throw error;
      // Success - real-time will replace temp message
      refetchThreads();
    } catch (error: any) {
      console.error('Error uploading media:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: error.message }
            : m
        )
      );
      toast({ variant: 'destructive', description: error.message });
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!organization?.id || !selectedThread) return;

    try {
      const audioFile = new File([audioBlob], `audio-${Date.now()}.ogg`, { type: audioBlob.type });
      await handleMediaUpload(audioFile);
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({ variant: 'destructive', description: error.message });
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

  const filteredThreads = threads?.filter((thread) =>
    thread.contact_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex h-[calc(100vh-2rem)] overflow-hidden">
        {/* Left Panel - Chat List */}
        <div className="w-80 border-r border-border flex flex-col bg-card">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold text-foreground">
                {t('nav.messages')}
              </h1>
              <Badge color="gray" size="md">
                {threads?.length || 0}
              </Badge>
            </div>
            <div className="relative">
              <SearchLg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={locale === 'pt-BR' ? 'Buscar conversas...' : 'Search conversations...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Chat List */}
          <ScrollArea className="flex-1">
            {threadsLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredThreads?.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                <p className="text-sm">
                  {locale === 'pt-BR' ? 'Nenhuma conversa' : 'No conversations'}
                </p>
              </div>
            ) : (
              <ListBox
                aria-label="Conversations"
                selectionMode="single"
                selectedKeys={selectedThreadId ? new Set([selectedThreadId]) : new Set()}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys).at(0) as string;
                  setSelectedThreadId(key || null);
                }}
              >
                {(filteredThreads || []).map((thread) => (
                  <ChatListItem key={thread.id} value={thread} locale={locale as 'pt-BR' | 'en-US'} />
                ))}
              </ListBox>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel - Chat */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedThread ? (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-border flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <Avatar fallbackText={selectedThread.contact_name} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {selectedThread.contact_name}
                      </span>
                      {isIn24hWindow && (
                        <BadgeWithDot color="success" size="sm">
                          {locale === 'pt-BR' ? 'Online' : 'Online'}
                        </BadgeWithDot>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedThread.contact_phone}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/contacts/${selectedThread.contact_id}`}>
                      <User01 className="w-4 h-4 mr-2" />
                      {locale === 'pt-BR' ? 'Ver perfil' : 'View profile'}
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              {showTemplates ? (
                <div className="flex-1 p-6">
                  <WhatsAppTemplateSelector
                    onSelect={handleSendTemplate}
                    onCancel={() => setShowTemplates(false)}
                    loading={submitting}
                  />
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 p-6">
                    {messagesLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const isOutbound = message.direction === 'outbound';
                          return (
                            <div
                              key={message.id}
                              className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={cn(
                                  'max-w-[70%] rounded-lg p-3',
                                  isOutbound
                                    ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                                    : 'bg-muted'
                                )}
                              >
                                {/* Media */}
                                {message.media_urls && message.media_urls.length > 0 && (
                                  <div className="mb-2 space-y-2">
                                    {message.media_urls.map((url, i) => {
                                      if (message.media_type === 'audio' || url.match(/\.(ogg|mp3|wav|m4a)$/i)) {
                                        return <AudioMessagePlayer key={i} src={url} />;
                                      }
                                      if (message.media_type === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                                        return (
                                          <img
                                            key={i}
                                            src={url}
                                            alt="Media"
                                            className="max-w-full rounded cursor-pointer hover:opacity-90"
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
                                          className="flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background/80"
                                        >
                                          <span className="text-sm underline">
                                            {locale === 'pt-BR' ? 'Ver documento' : 'View document'}
                                          </span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Content */}
                                {message.content && (
                                  <p className="text-sm whitespace-pre-wrap break-words">
                                    {message.content}
                                  </p>
                                )}

                                {/* Error */}
                                {message.error_message && (
                                  <p className="text-xs text-destructive mt-1">
                                    {message.error_message}
                                  </p>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-end gap-1 mt-1">
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
                        })}
                        <div ref={scrollRef} />
                      </div>
                    )}
                  </ScrollArea>

                  {/* Input Area */}
                  <div className="border-t border-border p-4 bg-card">
                    {!isIn24hWindow && messages.length > 0 && (
                      <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {locale === 'pt-BR'
                            ? 'Fora da janela de 24h. Use um template aprovado.'
                            : 'Outside 24h window. Use an approved template.'}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => setShowTemplates(true)}
                        >
                          {locale === 'pt-BR' ? 'Selecionar template' : 'Select template'}
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="flex gap-1">
                        <MediaUploadButton onUpload={handleMediaUpload} disabled={submitting || !isIn24hWindow} />
                        <AudioRecorder onSend={handleAudioSend} disabled={submitting || !isIn24hWindow} />
                      </div>
                      <Textarea
                        placeholder={locale === 'pt-BR' ? 'Digite uma mensagem...' : 'Type a message...'}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        rows={1}
                        className="flex-1 resize-none min-h-[40px]"
                        disabled={!isIn24hWindow && messages.length > 0}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={submitting || !messageText.trim() || (!isIn24hWindow && messages.length > 0)}
                        size="icon"
                        className="bg-green-600 hover:bg-green-700 shrink-0"
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send01 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-green-600" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <h3 className="font-semibold text-foreground mb-1">
                  {locale === 'pt-BR' ? 'Selecione uma conversa' : 'Select a conversation'}
                </h3>
                <p className="text-sm">
                  {locale === 'pt-BR'
                    ? 'Escolha uma conversa para visualizar as mensagens'
                    : 'Choose a conversation to view messages'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
