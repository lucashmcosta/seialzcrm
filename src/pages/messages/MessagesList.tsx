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
  CornerUpLeft,
  XClose,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCheck, Clock, AlertCircle, Sparkles, SpellCheck, Briefcase, Smile, Bot, MessageSquarePlus } from 'lucide-react';
import { AgentMessageFeedbackDialog } from '@/components/whatsapp/AgentMessageFeedbackDialog';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { MediaPreviewDialog } from '@/components/whatsapp/MediaPreviewDialog';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { ReplyPreview } from '@/components/whatsapp/ReplyPreview';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { cn } from '@/lib/utils';
import { useAI } from '@/hooks/useAI';

// Helper function for formatting relative time in human-readable format
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
  last_inbound_at: string | null;
  last_read_at: string | null;
  unread: boolean;
  needs_human_attention: boolean;
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
  reply_to_message_id: string | null;
  reply_to_message?: {
    content: string;
    direction: string;
  } | null;
  sender_type: 'user' | 'agent' | 'system' | null;
  sender_name: string | null;
  sender_agent_id: string | null;
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
          'relative flex items-center gap-3 border-b border-border py-3 pr-4 pl-3 select-none cursor-pointer',
          state.isFocused && 'outline-2 -outline-offset-2 outline-ring',
          state.isSelected && 'bg-accent',
          typeof className === 'function' ? className(state) : className
        )
      }
    >
      <Avatar fallbackText={value.contact_name} size="md" />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">
              {value.contact_name}
            </span>
            {value.unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeTime(value.updated_at, locale)}
          </span>
        </div>
        {value.needs_human_attention && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span className="text-[10px] font-medium">Atenção</span>
          </div>
        )}
      </div>
    </ListBoxItem>
  );
};

type ThreadFilter = 'all' | 'unread' | 'unanswered';

export default function MessagesList() {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [textareaOverflow, setTextareaOverflow] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('all');
  
  // Media preview state
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Image preview state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  // AI text improvement state
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiImproving, setAiImproving] = useState(false);
  const { generate: generateAI } = useAI();
  
  // Agent feedback state
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  
  // New conversation dialog state
  const [showNewConversation, setShowNewConversation] = useState(false);
  
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
  
  // Handle AI text improvement
  const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly') => {
    if (!messageText.trim()) return;
    
    setAiMenuOpen(false);
    setAiImproving(true);
    
    try {
      const result = await generateAI({
        action: 'improve_text',
        context: { text: messageText, mode }
      });
      
      setMessageText(result.content);
      adjustTextareaHeight();
    } catch (error: any) {
      console.error('AI improvement error:', error);
    } finally {
      setAiImproving(false);
    }
  };

  // Fetch threads
  const { data: threads, isLoading: threadsLoading, refetch: refetchThreads } = useQuery({
    queryKey: ['whatsapp-threads', organization?.id, userProfile?.id],
    queryFn: async () => {
      if (!organization?.id || !userProfile?.id) return [];

      const { data, error } = await supabase
        .from('message_threads')
        .select(`
          id,
          contact_id,
          updated_at,
          whatsapp_last_inbound_at,
          last_inbound_at,
          needs_human_attention,
          contacts!inner(full_name, phone)
        `)
        .eq('organization_id', organization.id)
        .eq('channel', 'whatsapp')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Get last message for each thread
      const threadIds = (data || []).map(t => t.id);
      
      // Fetch read timestamps for current user
      let readMap: Record<string, string> = {};
      if (threadIds.length > 0) {
        const { data: reads } = await supabase
          .from('message_thread_reads')
          .select('thread_id, last_read_at')
          .eq('user_id', userProfile.id)
          .in('thread_id', threadIds);
        
        if (reads) {
          for (const r of reads) {
            readMap[r.thread_id] = r.last_read_at;
          }
        }
      }

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
          const lastReadAt = readMap[thread.id] || null;
          const lastInboundAt = (thread as any).last_inbound_at || thread.whatsapp_last_inbound_at || null;
          
          // Calculate unread: inbound message exists after last_read_at
          const isUnread = lastMsg?.direction === 'inbound' && (
            !lastReadAt || 
            (lastInboundAt && new Date(lastInboundAt) > new Date(lastReadAt))
          );

          return {
            id: thread.id,
            contact_id: thread.contact_id,
            contact_name: contact?.full_name || 'Desconhecido',
            contact_phone: contact?.phone,
            last_message: lastMsg?.content || null,
            last_message_direction: lastMsg?.direction || null,
            updated_at: thread.updated_at,
            whatsapp_last_inbound_at: thread.whatsapp_last_inbound_at,
            last_inbound_at: lastInboundAt,
            last_read_at: lastReadAt,
            unread: !!isUnread,
            needs_human_attention: (thread as any).needs_human_attention || false,
          } as ChatThread;
        })
      );

      return threadsWithMessages;
    },
    enabled: !!organization?.id && !!userProfile?.id,
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
          // Resolve reply context since Realtime doesn't include joins
          const enrichMessage = async () => {
            let enriched = newMessage as Message;
            if (newMessage.reply_to_message_id && !newMessage.reply_to_message) {
              // Try local lookup first
              const localOriginal = messages.find(m => m.id === newMessage.reply_to_message_id);
              if (localOriginal) {
                enriched = {
                  ...newMessage,
                  reply_to_message: {
                    content: localOriginal.content,
                    direction: localOriginal.direction,
                  },
                } as Message;
              } else {
                // Fallback: query the database
                const { data } = await supabase
                  .from('messages')
                  .select('content, direction')
                  .eq('id', newMessage.reply_to_message_id)
                  .single();
                if (data) {
                  enriched = {
                    ...newMessage,
                    reply_to_message: data,
                  } as Message;
                }
              }
            }
            setMessages((prev) => {
              const filtered = prev.filter(
                (m) => !m.id.startsWith('temp-') && m.id !== enriched.id
              );
              return [...filtered, enriched];
            });
            scrollToBottom();
          };
          enrichMessage();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organization.id}`,
      }, (payload) => {
        const updatedMessage = payload.new as Message & { thread_id: string };
        
        // Update message if it's in the selected thread, preserving reply context
        if (updatedMessage.thread_id === selectedThreadId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === updatedMessage.id) {
                return {
                  ...updatedMessage,
                  reply_to_message: updatedMessage.reply_to_message || m.reply_to_message,
                } as Message;
              }
              return m;
            })
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
    setReplyingTo(null);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, direction, sent_at, whatsapp_status, media_urls, media_type, error_message, reply_to_message_id,
          sender_type, sender_name, sender_agent_id,
          reply_to_message:reply_to_message_id (content, direction)
        `)
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

      // Upsert last_read_at for current user
      if (userProfile?.id) {
        await supabase
          .from('message_thread_reads' as any)
          .upsert({
            thread_id: threadId,
            user_id: userProfile.id,
            last_read_at: new Date().toISOString()
          }, { onConflict: 'thread_id,user_id' });
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
      reply_to_message_id: replyingTo?.id || null,
      reply_to_message: replyingTo ? { content: replyingTo.content, direction: replyingTo.direction } : null,
      sender_type: 'user',
      sender_name: userProfile?.full_name || null,
      sender_agent_id: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    const savedText = messageText;
    const savedReplyTo = replyingTo;
    setMessageText('');
    setReplyingTo(null);
    scrollToBottom();

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          message: savedText,
          userId: userProfile?.id,
          replyToMessageId: savedReplyTo?.id || null,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.requiresTemplate) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setMessageText(savedText);
          setShowTemplates(true);
          return;
        }
        throw new Error(data.error);
      }

      refetchThreads();
    } catch (error: any) {
      console.error('Error sending message:', error);
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
      reply_to_message_id: null,
      reply_to_message: null,
      sender_type: 'user',
      sender_name: userProfile?.full_name || null,
      sender_agent_id: null,
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

  const handleFileSelected = (file: File) => {
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setPreviewFile(file);
      setShowMediaPreview(true);
    } else {
      handleMediaUpload(file, null);
    }
  };

  const handleMediaUpload = async (file: File, caption: string | null = null) => {
    if (!organization?.id || !selectedThread) return;

    setMediaUploading(true);
    setShowMediaPreview(false);
    setPreviewFile(null);

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${organization.id}/${fileName}`;

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';
    else if (file.type.startsWith('video/')) mediaType = 'video';

    const tempId = `temp-${Date.now()}`;
    const displayContent = caption || (mediaType === 'image' ? '📷 Imagem' : mediaType === 'audio' ? '🎵 Áudio' : mediaType === 'video' ? '🎬 Vídeo' : '📎 Mídia');
    const savedReplyTo = replyingTo;
    const tempMessage: Message = {
      id: tempId,
      content: displayContent,
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      whatsapp_status: 'sending',
      media_urls: null,
      media_type: mediaType,
      error_message: null,
      reply_to_message_id: savedReplyTo?.id || null,
      reply_to_message: savedReplyTo ? { content: savedReplyTo.content, direction: savedReplyTo.direction } : null,
      sender_type: 'user',
      sender_name: userProfile?.full_name || null,
      sender_agent_id: null,
    };

    setReplyingTo(null);

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
          message: caption,
          mediaUrl: publicUrl,
          mediaType,
          userId: userProfile?.id,
          replyToMessageId: savedReplyTo?.id || null,
        },
      });

      if (error) throw error;
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
    } finally {
      setMediaUploading(false);
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!organization?.id || !selectedThread) return;

    try {
      const audioFile = new File(
        [audioBlob], 
        `audio-${Date.now()}.ogg`, 
        { type: 'audio/ogg;codecs=opus' }
      );
      await handleMediaUpload(audioFile, null);
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({ variant: 'destructive', description: error.message });
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 150;
      setTextareaOverflow(scrollHeight > maxHeight);
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
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

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleReplyClick = (message: Message) => {
    setReplyingTo(message);
  };

  const filteredThreads = threads?.filter((thread) => {
    // Search filter
    if (searchQuery && !thread.contact_name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Status filter
    if (filter === 'unread') return thread.unread;
    if (filter === 'unanswered') return thread.last_message_direction === 'inbound';
    return true;
  });

  const filterOptions: { key: ThreadFilter; label: string }[] = [
    { key: 'all', label: locale === 'pt-BR' ? 'Todas' : 'All' },
    { key: 'unread', label: locale === 'pt-BR' ? 'Não lidas' : 'Unread' },
    { key: 'unanswered', label: locale === 'pt-BR' ? 'Não respondidas' : 'Unanswered' },
  ];

  return (
    <Layout>
      <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-2rem)]">
        {/* Left Panel - Chat List */}
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <div className="border-r border-border flex flex-col bg-card h-full">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-foreground">
                  {t('nav.messages')}
                </h1>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowNewConversation(true)}
                    title={locale === 'pt-BR' ? 'Nova Conversa' : 'New Conversation'}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                  </Button>
                  <Badge color="gray" size="md">
                    {threads?.length || 0}
                  </Badge>
                </div>
              </div>
              <div className="relative mb-3">
                <SearchLg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={locale === 'pt-BR' ? 'Buscar conversas...' : 'Search conversations...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {/* Filter chips */}
              <div className="flex gap-1.5">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilter(opt.key)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                      filter === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:bg-accent'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Chat */}
        <ResizablePanel defaultSize={75}>
          <div className="flex flex-col bg-background h-full">
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
                                className={`group flex items-center gap-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}
                              >
                                {/* Reply button - left side for inbound */}
                                {!isOutbound && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    onClick={() => handleReplyClick(message)}
                                    title={locale === 'pt-BR' ? 'Responder' : 'Reply'}
                                  >
                                    <CornerUpLeft className="h-4 w-4" />
                                  </Button>
                                )}
                                
                                <div
                                  className={cn(
                                    'relative max-w-[70%] rounded-lg p-3 min-w-[80px]',
                                    isOutbound
                                      ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                                      : 'bg-muted'
                                  )}
                                >
                                  {/* Agent Badge + Feedback Button for agent messages */}
                                  {isOutbound && message.sender_type === 'agent' && (
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge color="purple" size="sm" icon={<Bot className="w-3 h-3" />}>
                                        {message.sender_name || 'Agente IA'}
                                      </Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                          setFeedbackMessage(message);
                                          setShowFeedbackDialog(true);
                                        }}
                                      >
                                        <MessageSquarePlus className="w-3 h-3 mr-1" />
                                        Feedback
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {/* Quoted Message */}
                                  {message.reply_to_message && (
                                    <QuotedMessage
                                      content={message.reply_to_message.content}
                                      direction={message.reply_to_message.direction}
                                    />
                                  )}
                                  {/* Media */}
                                  {message.media_urls && message.media_urls.length > 0 && (
                                    <div className="space-y-2">
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
                                              className="max-w-[180px] max-h-[180px] rounded cursor-pointer hover:opacity-90 object-cover"
                                              onClick={() => setPreviewImageUrl(url)}
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

                                  {/* Content - hide media placeholders */}
                                  {message.content && 
                                   !(message.media_urls && message.media_urls.length > 0 && 
                                     ['📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo', '📎 Media', '📷 Image', '🎵 Audio', '🎬 Video'].includes(message.content)) && (
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

                                  {/* Footer - Name + Time + Status */}
                                  <div className="mt-1 flex items-center justify-end gap-1">
                                    <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                                      {isOutbound 
                                        ? (message.sender_name ? `${message.sender_name} - ` : '')
                                        : (selectedThread?.contact_name ? `${selectedThread.contact_name} - ` : '')
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
                                
                                {/* Reply button - right side for outbound */}
                                {isOutbound && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    onClick={() => handleReplyClick(message)}
                                    title={locale === 'pt-BR' ? 'Responder' : 'Reply'}
                                  >
                                    <CornerUpLeft className="h-4 w-4" />
                                  </Button>
                                )}
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

                      {/* Reply Preview */}
                      {replyingTo && (
                        <ReplyPreview
                          message={replyingTo}
                          onClose={() => setReplyingTo(null)}
                        />
                      )}

                      <div className={cn(
                        "flex gap-2",
                        replyingTo && "border border-t-0 border-border rounded-b-lg p-2 bg-card"
                      )}>
                        <div className="flex gap-1">
                          <MediaUploadButton onFileSelected={handleFileSelected} onTemplateClick={() => setShowTemplates(true)} disabled={submitting || mediaUploading || !isIn24hWindow} />
                          <AudioRecorder onSend={handleAudioSend} disabled={submitting || mediaUploading || !isIn24hWindow} />
                          
                          {/* Emoji Picker */}
                          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!isIn24hWindow && messages.length > 0}
                                className="h-10 w-10"
                              >
                                <FaceSmile className="h-5 w-5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-none" align="start" side="top">
                              <EmojiPicker
                                onEmojiClick={handleEmojiClick}
                                theme={document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                                lazyLoadEmojis
                                searchPlaceHolder={locale === 'pt-BR' ? 'Buscar emoji...' : 'Search emoji...'}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="relative flex-1">
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
                            className={`w-full resize-none min-h-[40px] max-h-[150px] pr-10 ${textareaOverflow ? 'overflow-y-auto' : 'overflow-hidden'}`}
                            disabled={!isIn24hWindow && messages.length > 0}
                          />
                          
                          {/* AI Improve Button */}
                          {hasAI && (
                            <DropdownMenu open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                  disabled={!messageText.trim() || aiImproving || (!isIn24hWindow && messages.length > 0)}
                                >
                                  {aiImproving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 text-purple-500" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleImproveText('grammar')}>
                                  <SpellCheck className="h-4 w-4 mr-2" />
                                  {locale === 'pt-BR' ? 'Corrigir gramática' : 'Fix grammar'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleImproveText('professional')}>
                                  <Briefcase className="h-4 w-4 mr-2" />
                                  {locale === 'pt-BR' ? 'Tornar profissional' : 'Make professional'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
                                  <Smile className="h-4 w-4 mr-2" />
                                  {locale === 'pt-BR' ? 'Tornar amigável' : 'Make friendly'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
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
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Media Preview Dialog */}
      <MediaPreviewDialog
        file={previewFile}
        open={showMediaPreview}
        onClose={() => {
          setShowMediaPreview(false);
          setPreviewFile(null);
        }}
        onSend={handleMediaUpload}
        isLoading={mediaUploading}
      />

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-transparent border-none">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background"
              onClick={() => setPreviewImageUrl(null)}
            >
              <XClose className="h-5 w-5" />
            </Button>
            {previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="Preview"
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Message Feedback Dialog */}
      {feedbackMessage && organization?.id && (
        <AgentMessageFeedbackDialog
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          message={{
            id: feedbackMessage.id,
            content: feedbackMessage.content,
            sender_agent_id: feedbackMessage.sender_agent_id,
            sender_name: feedbackMessage.sender_name,
          }}
          organizationId={organization.id}
          onFeedbackApplied={() => {
            setFeedbackMessage(null);
          }}
        />
      )}

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onSelectContact={(contactId, threadId) => {
          setSelectedThreadId(threadId);
          refetchThreads();
        }}
      />
    </Layout>
  );
}
