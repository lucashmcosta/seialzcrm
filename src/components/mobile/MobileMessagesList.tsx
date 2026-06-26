import { useState, useEffect, useRef, Fragment } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { MobileLayout } from './MobileLayout';
import { Avatar } from '@/components/base/avatar/avatar';
import { Badge, BadgeWithDot } from '@/components/base/badges/badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  SpinnerGap, Check, Checks, Clock, WarningCircle,
  Sparkle, Briefcase, Smiley, Robot, ChatCircleDots,
  FileText, Target, UserCheck, CheckCircle,
  ArrowCounterClockwise, Note, NotePencil, TextAa,
  CaretLeft, DotsThreeVertical, PaperPlaneTilt,
  MagnifyingGlass, Plus, X,
} from '@phosphor-icons/react';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { MessageStatusIndicator, MessageFailureInline } from '@/components/whatsapp/MessageStatusIndicator';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { audioBlobToFile } from '@/lib/audioBlobToFile';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { MediaPreviewDialog } from '@/components/whatsapp/MediaPreviewDialog';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { getProxiedMediaUrl } from '@/lib/mediaProxy';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { ReplyPreview } from '@/components/whatsapp/ReplyPreview';
import { AgentMessageFeedbackDialog } from '@/components/whatsapp/AgentMessageFeedbackDialog';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import { cn } from '@/lib/utils';
import { DateSeparator } from '@/components/messages/DateSeparator';
import { shouldShowDateSeparator } from '@/lib/dateSeparator';
import { useAI } from '@/hooks/useAI';
import { useMessageThreads, type ChatThread } from '@/hooks/useMessageThreads';

// ─── Types ───────────────────────────────────────────────────────
// ChatThread is imported from useMessageThreads

interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
  whatsapp_status: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_message: string | null;
  error_code: string | null;
  whatsapp_message_sid: string | null;
  reply_to_message_id: string | null;
  reply_to_message?: { content: string; direction: string } | null;
  sender_type: 'user' | 'agent' | 'system' | null;
  sender_name: string | null;
  sender_agent_id: string | null;
}

interface InlineNote {
  id: string;
  body: string | null;
  occurred_at: string;
  created_by_user_id: string | null;
  author_name?: string;
}

type ChatItem =
  | { _type: 'message'; data: Message }
  | { _type: 'note'; data: InlineNote };

type ThreadFilter = 'mine' | 'unassigned' | 'all_open' | 'resolved';

// ─── Helpers ─────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; labelEn: string; dotColor: string; color: string }> = {
  open: { label: 'Aberta', labelEn: 'Open', color: 'text-green-700 dark:text-green-400', dotColor: 'bg-green-500' },
  in_progress: { label: 'Em atendimento', labelEn: 'In progress', color: 'text-blue-700 dark:text-blue-400', dotColor: 'bg-blue-500' },
  awaiting_client: { label: 'Aguardando', labelEn: 'Awaiting', color: 'text-amber-700 dark:text-amber-400', dotColor: 'bg-amber-500' },
  resolved: { label: 'Resolvida', labelEn: 'Resolved', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
  closed: { label: 'Fechada', labelEn: 'Closed', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
};

const formatRelativeTime = (timestamp: string, locale: 'pt-BR' | 'en-US'): string => {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return locale === 'pt-BR' ? 'Ontem' : 'Yesterday';
  }
  if (diffDays < 7) {
    const day = d.toLocaleDateString(locale, { weekday: 'long' });
    return day.charAt(0).toUpperCase() + day.slice(1);
  }
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const getLastInboundTime = (
  thread: { last_inbound_at?: string | null; whatsapp_last_inbound_at?: string | null } | null | undefined,
  msgs: Message[]
): Date | null => {
  if (thread?.last_inbound_at) return new Date(thread.last_inbound_at);
  if (thread?.whatsapp_last_inbound_at) return new Date(thread.whatsapp_last_inbound_at);
  const lastInbound = msgs
    ?.filter(m => m.direction === 'inbound')
    ?.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())?.[0];
  if (lastInbound) return new Date(lastInbound.sent_at);
  return null;
};

// ─── Component ───────────────────────────────────────────────────
export function MobileMessagesList() {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromContactId = searchParams.get('contact');

  // View state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('all_open');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [inlineNotes, setInlineNotes] = useState<InlineNote[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Media state
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // AI state
  const [aiImproving, setAiImproving] = useState(false);
  const { generate: generateAI } = useAI();

  // Feedback
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  // Auth token for Twilio media proxy
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token));
  }, []);

  // New conversation
  const [showNewConversation, setShowNewConversation] = useState(false);

  // ─── Data fetching ───────────────────────────────────────────
  const { data: hasAIAgent } = useQuery({
    queryKey: ['org-has-ai-agent', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return false;
      const { data: agents } = await supabase
        .from('ai_agents')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .limit(1);
      return agents && agents.length > 0;
    },
    enabled: !!organization?.id,
  });

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
      return data && data.length > 0;
    },
    enabled: !!organization?.id,
  });

  // Fetch threads via RPC (replaces N+1 query)
  const { threads, loading: threadsLoading, refetchThreads, loadMore, hasMore, loadingMore, markThreadRead } = useMessageThreads({ channels: ['whatsapp'] });

  const selectedThread = threads?.find((t) => t.id === selectedThreadId);

  // Set default filter
  useEffect(() => {
    if (threads && threads.length > 0 && userProfile?.id) {
      const hasMine = threads.some(t => t.assigned_user_id === userProfile.id && ['open', 'awaiting_client', 'in_progress'].includes(t.status));
      setFilter(hasMine ? 'mine' : 'unassigned');
    }
  }, [threads?.length, userProfile?.id]);

  // Auto-select thread from contact query param (or create one if missing)
  useEffect(() => {
    if (!fromContactId || !organization?.id || selectedThreadId) return;

    const handleContactThread = async () => {
      // First check if thread already exists in loaded threads
      const match = threads?.find(t => t.contact_id === fromContactId);
      if (match) {
        setSelectedThreadId(match.id);
        if (['open', 'awaiting_client', 'in_progress'].includes(match.status)) {
          setFilter('all_open');
        } else if (match.status === 'resolved') {
          setFilter('resolved');
        }
        return;
      }

      // If threads loaded but no match, check DB or create
      if (threads) {
        // Check for existing thread not in current list (e.g. resolved and filtered out)
        const { data: existingThread } = await supabase
          .from('message_threads')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('contact_id', fromContactId)
          .eq('channel', 'whatsapp')
          .maybeSingle();

        if (existingThread) {
          setSelectedThreadId(existingThread.id);
          setFilter('all_open');
          refetchThreads();
          return;
        }

        // No thread exists — create one
        const { data: newThread, error } = await supabase
          .from('message_threads')
          .insert({
            organization_id: organization.id,
            contact_id: fromContactId,
            channel: 'whatsapp',
          })
          .select('id')
          .single();

        if (!error && newThread) {
          setSelectedThreadId(newThread.id);
          setFilter('all_open');
          refetchThreads();
        }
      }
    };

    handleContactThread();
  }, [fromContactId, threads, selectedThreadId, organization?.id]);

  // Fetch messages when thread selected
  useEffect(() => {
    if (selectedThreadId) fetchMessages(selectedThreadId);
  }, [selectedThreadId]);

  // Realtime: messages in active chat only (thread realtime handled by useMessageThreads hook)
  useEffect(() => {
    if (!organization?.id) return;
    const channel = supabase
      .channel(`mob-org-messages-${organization.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `organization_id=eq.${organization.id}`,
      }, (payload) => {
        const newMsg = payload.new as Message & { thread_id: string };
        if (newMsg.thread_id === selectedThreadId) {
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.id.startsWith('temp-') && m.id !== newMsg.id);
            return [...filtered, newMsg];
          });
          scrollToBottom();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `organization_id=eq.${organization.id}`,
      }, (payload) => {
        const upd = payload.new as Message & { thread_id: string };
        if (upd.thread_id === selectedThreadId) {
          setMessages((prev) => prev.map(m => m.id === upd.id ? { ...upd, reply_to_message: upd.reply_to_message || m.reply_to_message } as Message : m));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organization?.id, selectedThreadId]);

  // 24h window recalc
  useEffect(() => {
    if (!selectedThread) return;
    const check = () => {
      const t = getLastInboundTime(selectedThread, messages);
      setIsIn24hWindow(t ? (Date.now() - t.getTime()) / 3600000 < 24 : false);
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [selectedThread?.id, messages]);

  // ─── Actions ─────────────────────────────────────────────────
  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    setReplyingTo(null);
    setIsNoteMode(false);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`id, content, direction, sent_at, whatsapp_status, media_urls, media_type, error_message, reply_to_message_id, sender_type, sender_name, sender_agent_id, reply_to_message:reply_to_message_id (content, direction)`)
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      setMessages((data as Message[]) || []);

      const thread = threads?.find(t => t.id === threadId);
      if (thread?.contact_id && organization?.id) {
        const { data: notesData } = await supabase
          .from('activities')
          .select('id, body, occurred_at, created_by_user_id, users:created_by_user_id(full_name)')
          .eq('organization_id', organization.id)
          .eq('contact_id', thread.contact_id)
          .eq('activity_type', 'note')
          .is('deleted_at', null)
          .order('occurred_at', { ascending: true });
        setInlineNotes(
          (notesData || []).map((n: any) => ({
            id: n.id, body: n.body, occurred_at: n.occurred_at,
            created_by_user_id: n.created_by_user_id, author_name: n.users?.full_name || null,
          }))
        );
      } else {
        setInlineNotes([]);
      }

      const lastInboundTime = getLastInboundTime(thread, (data as Message[]) || []);
      setIsIn24hWindow(lastInboundTime ? (Date.now() - lastInboundTime.getTime()) / 3600000 < 24 : false);

      if (userProfile?.id) {
        await supabase.from('message_thread_reads' as any).upsert(
          { thread_id: threadId, user_id: userProfile.id, last_read_at: new Date().toISOString() },
          { onConflict: 'thread_id,user_id' }
        );
      }
      scrollToBottom();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const autoAssignOnSend = async (threadId: string, thread: ChatThread) => {
    if (!userProfile?.id) return;
    const updates: Record<string, any> = { status: 'awaiting_client' };
    if (!thread.assigned_user_id) {
      updates.assigned_user_id = userProfile.id;
      updates.assigned_at = new Date().toISOString();
    }
    if (thread.needs_human_attention && !thread.assigned_user_id) {
      updates.first_human_response_at = new Date().toISOString();
    }
    await supabase.from('message_threads').update(updates as never).eq('id', threadId);
  };

  const handleTakeOver = async (threadId: string) => {
    if (!userProfile?.id) return;
    const { error } = await supabase.from('message_threads').update({
      assigned_user_id: userProfile.id, assigned_at: new Date().toISOString(),
      needs_human_attention: true, status: 'open',
    }).eq('id', threadId);
    if (!error) refetchThreads();
  };

  const handleResolve = async (threadId: string) => {
    const { error } = await supabase.from('message_threads').update({
      status: 'resolved', resolved_at: new Date().toISOString(), needs_human_attention: false,
    }).eq('id', threadId);
    if (!error) refetchThreads();
  };

  const handleReturnToAI = async (threadId: string) => {
    const { error } = await supabase.from('message_threads').update({
      needs_human_attention: false, assigned_user_id: null, assigned_at: null, status: 'open',
    }).eq('id', threadId);
    if (!error) refetchThreads();
  };

  const handleReopen = async (threadId: string) => {
    const { error } = await supabase.from('message_threads').update({ status: 'open', resolved_at: null }).eq('id', threadId);
    if (!error) refetchThreads();
  };

  const handleAssign = async (threadId: string, userId: string | null) => {
    const { error } = await supabase.from('message_threads').update({
      assigned_user_id: userId, assigned_at: userId ? new Date().toISOString() : null,
      needs_human_attention: userId ? true : false,
    }).eq('id', threadId);
    if (!error) refetchThreads();
  };

  const handleSendNote = async () => {
    if (!organization?.id || !messageText.trim() || !selectedThread) return;
    const noteText = messageText.trim();
    const tempId = `note-temp-${Date.now()}`;
    setInlineNotes(prev => [...prev, { id: tempId, body: noteText, occurred_at: new Date().toISOString(), created_by_user_id: userProfile?.id || null, author_name: userProfile?.full_name || null }]);
    setMessageText('');
    setIsNoteMode(false);
    scrollToBottom();
    try {
      const { error } = await supabase.from('activities').insert({
        organization_id: organization.id, contact_id: selectedThread.contact_id,
        activity_type: 'note' as any, title: 'Nota na conversa', body: noteText,
        created_by_user_id: userProfile?.id, occurred_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch {
      setInlineNotes(prev => prev.filter(n => n.id !== tempId));
      toast({ variant: 'destructive', description: 'Erro ao salvar nota' });
    }
  };

  const handleSendMessage = async () => {
    if (isNoteMode) { handleSendNote(); return; }
    if (!organization?.id || !messageText.trim() || !selectedThread) return;
    if (!isIn24hWindow) { setShowTemplates(true); return; }

    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId, content: messageText, direction: 'outbound',
      sent_at: new Date().toISOString(), whatsapp_status: 'sending',
      media_urls: null, media_type: null, error_message: null, error_code: null, whatsapp_message_sid: null,
      reply_to_message_id: replyingTo?.id || null,
      reply_to_message: replyingTo ? { content: replyingTo.content, direction: replyingTo.direction } : null,
      sender_type: 'user', sender_name: userProfile?.full_name || null, sender_agent_id: null,
    };

    setMessages(prev => [...prev, tempMessage]);
    const savedText = messageText;
    const savedReplyTo = replyingTo;
    setMessageText('');
    setReplyingTo(null);
    scrollToBottom();

    if (selectedThreadId && selectedThread) autoAssignOnSend(selectedThreadId, selectedThread);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id, contactId: selectedThread.contact_id,
          threadId: selectedThreadId, message: savedText,
          userId: userProfile?.id, replyToMessageId: savedReplyTo?.id || null,
        },
      });
      if (error) throw error;
      if (data.error) {
        if (data.requiresTemplate) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          setMessageText(savedText);
          setShowTemplates(true);
          return;
        }
        throw new Error(data.error);
      }
      refetchThreads();
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, whatsapp_status: 'failed', error_message: error.message } : m));
      toast({ variant: 'destructive', description: error.message || 'Erro ao enviar mensagem' });
    }
  };

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!organization?.id || !selectedThread) return;
    setShowTemplates(false);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, content: '📋 Template...', direction: 'outbound',
      sent_at: new Date().toISOString(), whatsapp_status: 'sending',
      media_urls: null, media_type: null, error_message: null, error_code: null, whatsapp_message_sid: null,
      reply_to_message_id: null, reply_to_message: null,
      sender_type: 'user', sender_name: userProfile?.full_name || null, sender_agent_id: null,
    }]);
    scrollToBottom();

    if (selectedThreadId && selectedThread) autoAssignOnSend(selectedThreadId, selectedThread);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id, contactId: selectedThread.contact_id,
          threadId: selectedThreadId, templateId, templateVariables: variables,
          userId: userProfile?.id,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      refetchThreads();
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, whatsapp_status: 'failed', error_message: error.message } : m));
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
    setMessages(prev => [...prev, {
      id: tempId, content: displayContent, direction: 'outbound',
      sent_at: new Date().toISOString(), whatsapp_status: 'sending',
      media_urls: null, media_type: mediaType, error_message: null, error_code: null, whatsapp_message_sid: null,
      reply_to_message_id: savedReplyTo?.id || null,
      reply_to_message: savedReplyTo ? { content: savedReplyTo.content, direction: savedReplyTo.direction } : null,
      sender_type: 'user', sender_name: userProfile?.full_name || null, sender_agent_id: null,
    }]);
    setReplyingTo(null);
    scrollToBottom();

    try {
      const { error: uploadError } = await supabase.storage.from('whatsapp-media').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);

      const { error } = await supabase.functions.invoke('twilio-whatsapp-send', {
        body: {
          organizationId: organization.id, contactId: selectedThread.contact_id,
          threadId: selectedThreadId, message: caption, mediaUrl: publicUrl, mediaType,
          userId: userProfile?.id, replyToMessageId: savedReplyTo?.id || null,
        },
      });
      if (error) throw error;
      refetchThreads();
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, whatsapp_status: 'failed', error_message: error.message } : m));
      toast({ variant: 'destructive', description: error.message });
    } finally {
      setMediaUploading(false);
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!organization?.id || !selectedThread) return;
    try {
      const audioFile = audioBlobToFile(audioBlob);
      await handleMediaUpload(audioFile, null);
    } catch (error: any) {
      toast({ variant: 'destructive', description: error.message });
    }
  };

  const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly' | 'persuasive') => {
    if (!messageText.trim()) return;
    setAiImproving(true);
    try {
      const result = await generateAI({ action: 'improve_text', context: { text: messageText, mode } });
      setMessageText(result.content);
    } catch { /* ignore */ } finally { setAiImproving(false); }
  };

  const renderStatusIcon = (message: Message) => (
    <MessageStatusIndicator
      status={message.whatsapp_status}
      errorCode={message.error_code}
      errorMessage={message.error_message}
      sid={message.whatsapp_message_sid}
      sentAt={message.sent_at}
    />
  );

  // ─── Filters ──────────────────────────────────────────────────
  const filteredThreads = threads?.filter((thread) => {
    if (searchQuery && !thread.contact_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const isPendingFirstReply = thread.status === 'resolved' && !thread.last_inbound_at && !(thread as any).whatsapp_last_inbound_at;
    const isOpenLike = ['open', 'awaiting_client', 'in_progress'].includes(thread.status) || isPendingFirstReply;
    switch (filter) {
      case 'mine': return thread.assigned_user_id === userProfile?.id && isOpenLike;
      case 'unassigned': return !thread.assigned_user_id && (thread.status === 'open' || isPendingFirstReply);
      case 'all_open': return isOpenLike;
      case 'resolved': return thread.status === 'resolved' && (thread.last_inbound_at || (thread as any).whatsapp_last_inbound_at);
      default: return true;
    }
  });

  const filterOptions: { key: ThreadFilter; label: string }[] = [
    { key: 'mine', label: locale === 'pt-BR' ? 'Minhas' : 'Mine' },
    { key: 'unassigned', label: locale === 'pt-BR' ? 'Não atribuídas' : 'Unassigned' },
    { key: 'all_open', label: locale === 'pt-BR' ? 'Abertas' : 'Open' },
    { key: 'resolved', label: locale === 'pt-BR' ? 'Resolvidas' : 'Resolved' },
  ];

  const isInChat = !!selectedThreadId;

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <MobileLayout hideBottomBar={isInChat}>
      {!isInChat ? (
        /* ═══════════════════════════════════════════════════════
         * VIEW 1: Conversation List
         * ═══════════════════════════════════════════════════════ */
        <div className="flex flex-col h-full">
          {/* Search & Filters */}
          <div className="p-3 space-y-2 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={locale === 'pt-BR' ? 'Buscar...' : 'Search...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setShowNewConversation(true)}
              >
                <Plus size={18} weight="bold" />
              </Button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {filterOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full border whitespace-nowrap transition-colors',
                    filter === opt.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thread List */}
          <ScrollArea className="flex-1">
            {threadsLoading ? (
              <div className="p-3 space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredThreads?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ChatCircleDots size={32} weight="light" className="mb-2" />
                <p className="text-sm">{locale === 'pt-BR' ? 'Nenhuma conversa' : 'No conversations'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(filteredThreads || []).map((thread) => {
                  const status = statusConfig[thread.status] || statusConfig.open;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => { setSelectedThreadId(thread.id); markThreadRead(thread.id); }}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-accent/50 transition-colors"
                    >
                      <Avatar fallbackText={thread.contact_name} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {thread.contact_name}
                            </span>
                            {thread.unread && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatRelativeTime(thread.updated_at, locale as 'pt-BR' | 'en-US')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status.dotColor)} />
                          <span className={cn('text-[10px] font-medium', status.color)}>
                            {locale === 'pt-BR' ? status.label : status.labelEn}
                          </span>
                          {thread.assigned_user_name && (
                            <>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                                {thread.assigned_user_name}
                              </span>
                            </>
                          )}
                        </div>
                        {thread.last_message && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {thread.last_message_direction === 'outbound' && (
                              <span className="text-muted-foreground/60">Você: </span>
                            )}
                            {thread.last_message}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {hasMore && (
                  <div className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="text-xs text-muted-foreground"
                    >
                      {loadingMore
                        ? (locale === 'pt-BR' ? 'Carregando...' : 'Loading...')
                        : (locale === 'pt-BR' ? 'Carregar mais' : 'Load more')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════
         * VIEW 2: Fullscreen Chat
         * ═══════════════════════════════════════════════════════ */
        <div className="flex flex-col h-full">
          {/* Chat Header */}
          <div className="h-14 flex items-center gap-2 px-2 border-b border-border bg-card shrink-0">
            <button
              onClick={() => {
                if (fromContactId) {
                  navigate(`/contacts/${fromContactId}`);
                } else {
                  setSelectedThreadId(null); setMessages([]); setInlineNotes([]);
                }
              }}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <CaretLeft size={20} weight="bold" />
            </button>
            <Link to={`/contacts/${selectedThread?.contact_id}`} className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar fallbackText={selectedThread?.contact_name || '?'} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{selectedThread?.contact_name}</p>
                <div className="flex items-center gap-1">
                  {selectedThread?.status && statusConfig[selectedThread.status] && (
                    <span className={cn('text-[10px] font-medium', statusConfig[selectedThread.status].color)}>
                      {locale === 'pt-BR' ? statusConfig[selectedThread.status].label : statusConfig[selectedThread.status].labelEn}
                    </span>
                  )}
                  {isIn24hWindow && (
                    <BadgeWithDot color="success" size="sm">Online</BadgeWithDot>
                  )}
                </div>
              </div>
            </Link>

            {/* Thread Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 text-muted-foreground hover:text-foreground">
                  <DotsThreeVertical size={20} weight="bold" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedThread && (!selectedThread.assigned_user_id || selectedThread.assigned_user_id !== userProfile?.id) && selectedThread.status !== 'resolved' && (
                  <DropdownMenuItem onClick={() => handleTakeOver(selectedThread.id)}>
                    <UserCheck className="w-4 h-4 mr-2" />
                    {locale === 'pt-BR' ? 'Assumir' : 'Take Over'}
                  </DropdownMenuItem>
                )}
                {selectedThread && ['open', 'awaiting_client', 'in_progress'].includes(selectedThread.status) && (
                  <DropdownMenuItem onClick={() => handleResolve(selectedThread.id)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {locale === 'pt-BR' ? 'Resolver' : 'Resolve'}
                  </DropdownMenuItem>
                )}
                {selectedThread?.needs_human_attention && hasAIAgent && (
                  <DropdownMenuItem onClick={() => handleReturnToAI(selectedThread.id)}>
                    <Robot className="w-4 h-4 mr-2" />
                    {locale === 'pt-BR' ? 'Devolver ao AI' : 'Return to AI'}
                  </DropdownMenuItem>
                )}
                {selectedThread?.status === 'resolved' && (
                  <DropdownMenuItem onClick={() => handleReopen(selectedThread.id)}>
                    <ArrowCounterClockwise className="w-4 h-4 mr-2" />
                    {locale === 'pt-BR' ? 'Reabrir' : 'Reopen'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Messages Area */}
          {showTemplates ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <WhatsAppTemplateSelector
                onSelect={handleSendTemplate}
                onCancel={() => setShowTemplates(false)}
              />
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                {messagesLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                        <Skeleton className="h-14 w-40 rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {(() => {
                      const chatItems: ChatItem[] = [
                        ...messages.map(m => ({ _type: 'message' as const, data: m })),
                        ...inlineNotes.map(n => ({ _type: 'note' as const, data: n })),
                      ].sort((a, b) => {
                        const dateA = a._type === 'message' ? a.data.sent_at : a.data.occurred_at;
                        const dateB = b._type === 'message' ? b.data.sent_at : b.data.occurred_at;
                        return new Date(dateA).getTime() - new Date(dateB).getTime();
                      });

                      return chatItems.map((item, idx) => {
                        const itemDate = item._type === 'message' ? item.data.sent_at : item.data.occurred_at;
                        const prevItem = chatItems[idx - 1];
                        const prevDate = prevItem ? (prevItem._type === 'message' ? prevItem.data.sent_at : prevItem.data.occurred_at) : null;
                        const showDateSep = shouldShowDateSeparator(itemDate, prevDate);
                        const sep = showDateSep ? <DateSeparator key={`sep-${idx}`} date={new Date(itemDate)} /> : null;

                        if (item._type === 'note') {
                          const note = item.data;
                          return (
                            <div key={`note-${note.id}`}>
                              {sep}
                              <div className="flex justify-center">
                              <div className="max-w-[85%] rounded-lg p-2.5 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <NotePencil className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                                  <span className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400">Nota interna</span>
                                </div>
                                <p className="text-xs whitespace-pre-wrap break-all text-yellow-900 dark:text-yellow-100">{note.body}</p>
                                <div className="mt-1 flex items-center justify-end">
                                  <span className="text-[9px] text-yellow-600/70 dark:text-yellow-400/70">
                                    {note.author_name ? `${note.author_name} · ` : ''}
                                    {new Date(note.occurred_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                </div>
                              </div>
                              </div>
                            </div>
                          );
                        }

                        const message = item.data;
                        const isOutbound = message.direction === 'outbound';

                        return (
                          <div key={message.id}>
                            {sep}
                            <div
                              className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}
                            >
                            <div
                              className={cn(
                'max-w-[85%] rounded-lg min-w-[60px]',
                message.media_type === 'audio' && !message.content ? 'p-1' : 'p-2.5',
                                isOutbound
                                  ? 'bg-[#054D3E] text-white'
                                  : 'bg-muted'
                              )}
                              onDoubleClick={() => setReplyingTo(message)}
                            >
                              {/* Agent badge */}
                              {isOutbound && message.sender_type === 'agent' && (
                                <div className="flex items-center gap-1 mb-1">
                                  <Badge color="purple" size="sm" icon={<Robot className="w-3 h-3" />}>
                                    {message.sender_name || 'AI'}
                                  </Badge>
                                </div>
                              )}

                              {/* Human sender name */}
                              {isOutbound && message.sender_type === 'user' && message.sender_name && (
                                <div className="text-[10px] font-semibold text-white/70 mb-1">
                                  {message.sender_name}
                                </div>
                              )}

                              {/* Quoted */}
                              {message.reply_to_message && (
                                <QuotedMessage content={message.reply_to_message.content} direction={message.reply_to_message.direction} />
                              )}

                              {/* Media */}
                              {message.media_urls && message.media_urls.length > 0 && (
                                <div className="space-y-1 mb-1">
                                  {message.media_urls.map((rawUrl, i) => {
                                    const url = getProxiedMediaUrl(rawUrl, organization?.id, accessToken);
                                    if (message.media_type === 'audio' || rawUrl.match(/\.(ogg|mp3|wav|m4a)$/i)) {
                                      const isAudioOnly = message.media_type === 'audio' && !message.content;
                                      return <AudioMessagePlayer key={i} src={url}
                                        messageId={message.id}
                                        threadId={(message as any).thread_id}
                                        mediaType={message.media_type}
                                        timestamp={isAudioOnly ? new Date(message.sent_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : undefined}
                                        statusIcon={isAudioOnly && isOutbound ? renderStatusIcon(message) : undefined}
                                      />;
                                    }
                                    if (message.media_type === 'image' || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))
                                      return <img key={i} src={url} alt="" className="max-w-full max-h-[200px] rounded cursor-pointer object-cover" onClick={() => setPreviewImageUrl(url)} />;
                                    return (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 p-1.5 rounded bg-background/50">
                                        <FileText className="w-3.5 h-3.5" />
                                        <span className="text-xs underline">{locale === 'pt-BR' ? 'Ver documento' : 'View document'}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Content */}
                              {message.content && !(message.media_urls && message.media_urls.length > 0 && ['📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo'].includes(message.content)) && (
                                <p className="text-sm whitespace-pre-wrap break-all">{message.content}</p>
                              )}

                              {message.whatsapp_status === 'failed' && (
                                <MessageFailureInline errorCode={message.error_code} />
                              )}

                              {/* Footer (hidden for audio-only, rendered inside player) */}
                              {!(message.media_type === 'audio' && !message.content) && (
                              <div className="mt-0.5 flex items-center justify-end gap-1">
                                <span className={cn('text-[11px] leading-[14px]', isOutbound ? 'text-white/60' : 'text-muted-foreground/70')}>
                                  {new Date(message.sent_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                                {isOutbound && renderStatusIcon(message)}
                              </div>
                              )}
                            </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    <div ref={scrollRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input Bar */}
              <div className="border-t border-border p-2 bg-card shrink-0" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
                {!isIn24hWindow && messages.length > 0 ? (
                  <div className="flex flex-col items-center gap-2 py-3 text-center">
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <Clock className="h-4 w-4" />
                      <p className="text-xs font-medium">{locale === 'pt-BR' ? 'Fora da janela de 24h' : 'Outside 24h window'}</p>
                    </div>
                    <Button onClick={() => setShowTemplates(true)} size="sm" className="text-xs">
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      {locale === 'pt-BR' ? 'Enviar template' : 'Send template'}
                    </Button>
                  </div>
                ) : (
                  <>
                    {isNoteMode && (
                      <div className="flex items-center gap-2 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-t-lg mb-1">
                        <NotePencil className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-[10px] font-medium text-yellow-700 dark:text-yellow-400">{locale === 'pt-BR' ? 'Nota interna' : 'Internal note'}</span>
                        <button onClick={() => setIsNoteMode(false)} className="ml-auto">
                          <X className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                        </button>
                      </div>
                    )}
                    {replyingTo && !isNoteMode && (
                      <ReplyPreview message={replyingTo} onClose={() => setReplyingTo(null)} />
                    )}
                    <div className="flex items-end gap-1.5">
                      <div className="flex gap-0.5 shrink-0">
                        <MediaUploadButton onFileSelected={handleFileSelected} onTemplateClick={() => setShowTemplates(true)} onNoteClick={() => setIsNoteMode(true)} disabled={submitting || mediaUploading} />
                        <AudioRecorder onSend={handleAudioSend} disabled={submitting || mediaUploading} />
                      </div>
                      <Textarea
                        ref={textareaRef}
                        placeholder={isNoteMode ? (locale === 'pt-BR' ? 'Nota interna...' : 'Internal note...') : (locale === 'pt-BR' ? 'Mensagem...' : 'Message...')}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                        }}
                        rows={1}
                        className="flex-1 resize-none min-h-[36px] max-h-[100px] text-sm"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={submitting || !messageText.trim()}
                        size="icon"
                        className={cn(
                          'h-9 w-9 shrink-0',
                          isNoteMode ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-950' : 'bg-green-600 hover:bg-green-700'
                        )}
                      >
                        {submitting ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Dialogs ─────────────────────────────────────────── */}
      <MediaPreviewDialog
        file={previewFile}
        open={showMediaPreview}
        onClose={() => { setShowMediaPreview(false); setPreviewFile(null); }}
        onSend={handleMediaUpload}
        isLoading={mediaUploading}
      />

      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-0 bg-transparent border-none">
          {previewImageUrl && (
            <img src={previewImageUrl} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {feedbackMessage && organization?.id && (
        <AgentMessageFeedbackDialog
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          message={{
            id: feedbackMessage.id, content: feedbackMessage.content,
            sender_agent_id: feedbackMessage.sender_agent_id, sender_name: feedbackMessage.sender_name,
          }}
          organizationId={organization.id}
          onFeedbackApplied={() => setFeedbackMessage(null)}
        />
      )}

      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onSelectContact={(contactId, threadId) => {
          setSelectedThreadId(threadId);
          refetchThreads();
        }}
      />
    </MobileLayout>
  );
}
