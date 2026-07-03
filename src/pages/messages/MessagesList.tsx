import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { dispatchWhatsAppSend } from "@/lib/dispatchWhatsAppSend";
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileMessagesList } from '@/components/mobile/MobileMessagesList';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useWhatsAppProvider } from '@/hooks/useWhatsAppProvider';
import { useThreadBusinessContext } from '@/hooks/useThreadBusinessContext';
import { resolveComposerProvider } from '@/lib/resolveComposerProvider';
import { pickPreferredEndpoint, filterEndpointsByIntent } from '@/lib/composerEndpoint';
import { isSalesPurpose } from '@/lib/endpointPurpose';
import { SpinnerGap, Check, Checks, Clock, WarningCircle, Sparkle, Briefcase, Smiley, Robot, ChatCircleDots, FileText, Target, UserCheck, CheckCircle, ArrowCounterClockwise, ArrowsLeftRight, Note, DownloadSimple, NotePencil, TextAa, TrendUp, TrendDown } from '@phosphor-icons/react';
import { MessageStatusIndicator, MessageFailureInline } from '@/components/whatsapp/MessageStatusIndicator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CloseDatePromptDialog } from '@/components/opportunities/CloseDatePromptDialog';
import { AgentMessageFeedbackDialog } from '@/components/whatsapp/AgentMessageFeedbackDialog';
import { getProxiedMediaUrl } from '@/lib/mediaProxy';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { audioBlobToFile } from '@/lib/audioBlobToFile';
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { MediaPreviewDialog } from '@/components/whatsapp/MediaPreviewDialog';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import { QuotedMessage } from '@/components/whatsapp/QuotedMessage';
import { ReplyPreview } from '@/components/whatsapp/ReplyPreview';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { cn } from '@/lib/utils';
import { useAI } from '@/hooks/useAI';
import { useMessageThreads, type ChatThread } from '@/hooks/useMessageThreads';
import { useOrgWhatsAppEndpoints } from '@/hooks/useOrgWhatsAppEndpoints';
import { useThreadEndpointMap } from '@/hooks/useThreadEndpointMap';
import { EndpointBadge } from '@/components/messages/EndpointBadge';
import { EndpointFilterDialog } from '@/components/messages/EndpointFilterDialog';
import { FunnelSimple } from '@phosphor-icons/react';
import { formatEndpointIdentity, formatEndpointMigrationAuditLine } from '@/lib/whatsappEndpointDisplay';

import { useHiddenThreads } from '@/hooks/useHiddenThreads';
import { EyeSlash } from '@phosphor-icons/react';
import { ToastAction } from '@/components/ui/toast';

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
  reply_to_message?: {
    content: string;
    direction: string;
  } | null;
  sender_type: 'user' | 'agent' | 'system' | null;
  sender_name: string | null;
  sender_agent_id: string | null;
  metadata?: Record<string, any> | null;
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

const statusConfig: Record<string, { label: string; labelEn: string; color: string; dotColor: string }> = {
  open: { label: 'Aberta', labelEn: 'Open', color: 'text-green-700 dark:text-green-400', dotColor: 'bg-green-500' },
  in_progress: { label: 'Em atendimento', labelEn: 'In progress', color: 'text-blue-700 dark:text-blue-400', dotColor: 'bg-blue-500' },
  awaiting_client: { label: 'Aguardando', labelEn: 'Awaiting', color: 'text-amber-700 dark:text-amber-400', dotColor: 'bg-amber-500' },
  resolved: { label: 'Resolvida', labelEn: 'Resolved', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
  closed: { label: 'Fechada', labelEn: 'Closed', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
};

interface ChatListItemProps extends ListBoxItemProps<ChatThread> {
  value: ChatThread;
  locale: 'pt-BR' | 'en-US';
  showLastMessage?: boolean;
  onHide?: (threadId: string) => void;
  endpointAddress?: string | null;
  endpointPurpose?: string | null;
  officialNumbers?: Set<string>;
}

const ChatListItem = ({ value, locale, className, onHide, endpointAddress, endpointPurpose, officialNumbers, ...otherProps }: ChatListItemProps) => {
  if (!value) return null;

  const status = statusConfig[value.status] || statusConfig.open;

  return (
    <ListBoxItem
      {...otherProps}
      id={value.id}
      textValue={value.contact_name}
      className={(state) =>
        cn(
          'group relative flex items-center gap-3 border-b border-border py-3 pr-4 pl-3 select-none cursor-pointer',
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
            {endpointAddress && <EndpointBadge externalAddress={endpointAddress} purpose={endpointPurpose ?? null} officialNumbers={endpointPurpose == null ? officialNumbers : undefined} />}
            {(value.unread) && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(value.updated_at, locale)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Status dot */}
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status.dotColor)} />
          <span className={cn('text-[10px] font-medium', status.color)}>
            {locale === 'pt-BR' ? status.label : status.labelEn}
          </span>
          {value.assigned_user_name && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                {value.assigned_user_name}
              </span>
            </>
          )}
        </div>
        {value.needs_human_attention && (
          <div className="flex items-center gap-1 text-destructive mt-0.5">
            <WarningCircle className="h-3 w-3" />
            <span className="text-[10px] font-medium">Atenção</span>
          </div>
        )}
      </div>
    </ListBoxItem>
  );
};

type ThreadFilter = 'mine' | 'unassigned' | 'all_open' | 'resolved';

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

function DesktopMessagesList() {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { permissions } = usePermissions();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadOverride, setSelectedThreadOverride] = useState<(ChatThread & { primary_endpoint_id?: string | null }) | null>(null);
  const selectedThreadWaProvider = useWhatsAppProvider({ threadId: selectedThreadId });
  const [textareaOverflow, setTextareaOverflow] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isIn24hWindow, setIsIn24hWindow] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = usePersistedFilters<string>('messages.search', '');
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchQuery || '');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery || ''), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [filter, setFilter, , filterHydrated] = usePersistedFilters<ThreadFilter | null>('messages.filter', null);
  const effectiveFilter: ThreadFilter = filter ?? 'all_open';
  const appliedSmartDefaultRef = useRef(false);
  
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
  const [endpointFilter, setEndpointFilter] = useState<string>('all');
  const [endpointFilterOpen, setEndpointFilterOpen] = useState(false);
  const [selectedEndpointDetails, setSelectedEndpointDetails] = useState<{ threadId: string; endpoint: any | null } | null>(null);

  // Auth token for Twilio media proxy
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token));
  }, []);
  
  // Note mode state
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [inlineNotes, setInlineNotes] = useState<InlineNote[]>([]);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Opportunities for current contact (mark as won/lost from chat)
  type ChatOpp = { id: string; title: string; pipeline_stage_id: string; close_date: string | null };
  const [contactOpportunities, setContactOpportunities] = useState<ChatOpp[]>([]);
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: string; name: string; type: string | null; order_index: number | null }>>([]);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'won' | 'lost'; opp: ChatOpp } | null>(null);
  const [pendingCloseDate, setPendingCloseDate] = useState<{ kind: 'won' | 'lost'; opp: ChatOpp } | null>(null);
  const [moveStageOpp, setMoveStageOpp] = useState<ChatOpp | null>(null);
  const [moveStageTargetId, setMoveStageTargetId] = useState<string | null>(null);
  const [movingStage, setMovingStage] = useState(false);
  const [markingOpp, setMarkingOpp] = useState(false);

  const handleExportConversations = async () => {
    if (!organization?.id) return;
    setIsExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No session');

      const response = await fetch(
        `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/export-conversations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE',
          },
          body: JSON.stringify({
            organization_id: organization.id,
            opportunity_status: 'won',
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error || 'Export failed');
      }

      const text = await response.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversas-won-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: locale === 'pt-BR' ? 'Exportação concluída' : 'Export completed',
        description: locale === 'pt-BR' ? 'Arquivo baixado com sucesso' : 'File downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: locale === 'pt-BR' ? 'Erro na exportação' : 'Export error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };
  // Check if organization has an active AI agent (controls "Return to AI" button)
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

  // Check if organization has AI integration configured (controls text improvement buttons)
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
  
  // Handle AI text improvement
  const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly' | 'persuasive') => {
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

  // === THREAD ACTIONS ===
  const handleTakeOver = async (threadId: string) => {
    if (!userProfile?.id) return;
    const { error } = await supabase
      .from('message_threads')
      .update({
        assigned_user_id: userProfile.id,
        assigned_at: new Date().toISOString(),
        needs_human_attention: true,
        status: 'open',
      })
      .eq('id', threadId);
    if (error) {
      toast({ variant: 'destructive', description: 'Erro ao assumir conversa' });
    } else {
      refetchThreads();
    }
  };

  const handleResolve = async (threadId: string) => {
    const { error } = await supabase
      .from('message_threads')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        needs_human_attention: false,
      })
      .eq('id', threadId);
    if (error) {
      toast({ variant: 'destructive', description: 'Erro ao resolver conversa' });
    } else {
      refetchThreads();
    }
  };

  const handleReturnToAI = async (threadId: string) => {
    const { error } = await supabase
      .from('message_threads')
      .update({
        needs_human_attention: false,
        assigned_user_id: null,
        assigned_at: null,
        status: 'open',
      })
      .eq('id', threadId);
    if (error) {
      toast({ variant: 'destructive', description: 'Erro ao devolver ao AI' });
    } else {
      refetchThreads();
    }
  };

  const handleReopen = async (threadId: string) => {
    const { error } = await supabase
      .from('message_threads')
      .update({
        status: 'open',
        resolved_at: null,
      })
      .eq('id', threadId);
    if (error) {
      toast({ variant: 'destructive', description: 'Erro ao reabrir conversa' });
    } else {
      refetchThreads();
    }
  };

  const handleAssign = async (threadId: string, userId: string | null) => {
    const { error } = await supabase
      .from('message_threads')
      .update({
        assigned_user_id: userId,
        assigned_at: userId ? new Date().toISOString() : null,
        needs_human_attention: userId ? true : false,
      })
      .eq('id', threadId);
    if (error) {
      toast({ variant: 'destructive', description: 'Erro ao atribuir conversa' });
    } else {
      refetchThreads();
    }
  };

  // Auto-assign when sending message
  const autoAssignOnSend = async (threadId: string, thread: ChatThread) => {
    if (!userProfile?.id) return;
    
    const updates: Record<string, any> = {
      status: 'awaiting_client',
    };
    
    if (!thread.assigned_user_id) {
      updates.assigned_user_id = userProfile.id;
      updates.assigned_at = new Date().toISOString();
    }

    if (thread.needs_human_attention && !thread.assigned_user_id) {
      // First human response after handoff
      updates.first_human_response_at = new Date().toISOString();
    }

    await supabase
      .from('message_threads')
      .update(updates as never)
      .eq('id', threadId);
  };

  // Fetch threads via RPC (replaces N+1 query)
  const { threads, loading: threadsLoading, refetchThreads, loadMore, hasMore, loadingMore, markThreadRead } = useMessageThreads({ channels: ['whatsapp'], search: debouncedSearch });

  const selectedThread = threads?.find((t) => t.id === selectedThreadId)
    ?? (selectedThreadOverride?.id === selectedThreadId ? selectedThreadOverride : undefined);

  // Multi-number support (temporary CT transition period).
  // Only renders selector + per-thread badge when the org has 2+ active endpoints.
  const { endpoints: orgEndpoints, officialNumbers, hasMultiple: hasMultipleEndpoints } = useOrgWhatsAppEndpoints(organization?.id);
  const threadIdsForEndpointMap = (threads ?? []).map((t) => t.id);
  const threadEndpointMap = useThreadEndpointMap(threadIdsForEndpointMap, hasMultipleEndpoints);
  const endpointById: Record<string, typeof orgEndpoints[number]> = Object.fromEntries(orgEndpoints.map((e) => [e.id, e]));

  // PR4: business_context da thread selecionada. Quando 'sales', o composer
  // deve preferir endpoint com purpose ∈ SALES_PURPOSES (comercial). Ex.:
  // thread histórica do 7027 pré-16/06 aparece como sales em /messages e
  // enviaremos pelo 7020 (comercial), não pelo 7027 (customer_service).
  const selectedThreadBusinessContext = useThreadBusinessContext(selectedThreadId);
  const salesEndpoints = useMemo(
    () => filterEndpointsByIntent(orgEndpoints, 'sales'),
    [orgEndpoints],
  );

  // Per-thread composer endpoint choice. Defaults respeitam business_context.
  // Does NOT persist back to the thread — purely a per-send choice.
  const [composerEndpointByThread, setComposerEndpointByThread] = useState<Record<string, string>>({});
  const selectedThreadPrimaryEndpointId = selectedThreadId
    ? threadEndpointMap[selectedThreadId]
      ?? (selectedThreadOverride?.id === selectedThreadId ? selectedThreadOverride.primary_endpoint_id ?? null : null)
    : null;
  const primaryEndpointPurpose = selectedThreadPrimaryEndpointId
    ? endpointById[selectedThreadPrimaryEndpointId]?.purpose ?? null
    : null;

  const defaultComposerEndpointId = (() => {
    // /messages + business_context='sales': se o primary_endpoint atual não
    // for comercial, escolher o comercial preferido; senão, manter o primary.
    if (selectedThreadBusinessContext === 'sales' && salesEndpoints.length > 0) {
      if (selectedThreadPrimaryEndpointId && isSalesPurpose(primaryEndpointPurpose)) {
        return selectedThreadPrimaryEndpointId;
      }
      return pickPreferredEndpoint(salesEndpoints, 'sales')?.id ?? null;
    }
    // Demais casos: comportamento legado (primary da thread → primeiro ativo).
    return selectedThreadPrimaryEndpointId ?? orgEndpoints[0]?.id ?? null;
  })();

  const composerEndpointId = selectedThreadId
    ? composerEndpointByThread[selectedThreadId] ?? defaultComposerEndpointId
    : null;
  const setComposerEndpointId = (id: string) => {
    if (!selectedThreadId) return;
    setComposerEndpointByThread((prev) => ({ ...prev, [selectedThreadId]: id }));
  };
  const selectedEndpointFallback = selectedEndpointDetails?.threadId === selectedThreadId
    ? selectedEndpointDetails.endpoint
    : null;
  const selectedThreadEndpoint = selectedThreadPrimaryEndpointId
    ? endpointById[selectedThreadPrimaryEndpointId] ?? selectedEndpointFallback ?? undefined
    : selectedEndpointFallback ?? undefined;
  const selectedEndpointIdentity = formatEndpointIdentity(selectedThreadEndpoint);

  useEffect(() => {
    if (!selectedThreadId || !organization?.id) {
      setSelectedEndpointDetails(null);
      return;
    }

    const knownEndpoint = selectedThreadPrimaryEndpointId ? endpointById[selectedThreadPrimaryEndpointId] : null;
    if (knownEndpoint) {
      setSelectedEndpointDetails({ threadId: selectedThreadId, endpoint: knownEndpoint });
      return;
    }

    let cancelled = false;
    supabase
      .from('message_threads')
      .select('primary_endpoint:communication_endpoints ( id, external_address, display_name, provider, purpose, is_active, created_at )')
      .eq('organization_id', organization.id)
      .eq('id', selectedThreadId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[messages] endpoint detail load failed', error.message);
          setSelectedEndpointDetails({ threadId: selectedThreadId, endpoint: null });
          return;
        }
        setSelectedEndpointDetails({ threadId: selectedThreadId, endpoint: (data as any)?.primary_endpoint ?? null });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, organization?.id, selectedThreadPrimaryEndpointId, orgEndpoints]);

  // Set default filter based on assigned threads — only on first load
  // when there's no persisted choice yet. Once the user picks a filter,
  // the persisted value wins and this effect no-ops.
  useEffect(() => {
    if (!filterHydrated) return;
    if (filter !== null) return;
    if (appliedSmartDefaultRef.current) return;
    if (!threads || threads.length === 0 || !userProfile?.id) return;
    const hasMine = threads.some(t => t.assigned_user_id === userProfile.id && ['open', 'awaiting_client', 'in_progress'].includes(t.status));
    setFilter(hasMine ? 'mine' : 'unassigned');
    appliedSmartDefaultRef.current = true;
  }, [filterHydrated, filter, threads, userProfile?.id, setFilter]);

  // Fetch messages when thread selected
  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    }
  }, [selectedThreadId]);

  // Fetch pipeline stages once per org (for won/lost mapping)
  useEffect(() => {
    if (!organization?.id) return;
    (async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, type, order_index')
        .eq('organization_id', organization.id)
        .order('order_index', { ascending: true });
      if (data) setPipelineStages(data as any);
    })();
  }, [organization?.id]);

  // Fetch open opportunities for the selected thread's contact
  useEffect(() => {
    const contactId = selectedThread?.contact_id;
    if (!organization?.id || !contactId) {
      setContactOpportunities([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('opportunities')
        .select('id, title, pipeline_stage_id, close_date')
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .eq('status', 'open')
        .is('deleted_at', null);
      setContactOpportunities((data as ChatOpp[]) || []);
    })();
  }, [organization?.id, selectedThread?.contact_id]);

  const handleMarkOpportunity = async (kind: 'won' | 'lost', opp: ChatOpp, closeDateOverride?: string) => {
    if (!organization?.id) return;
    const targetStage = pipelineStages.find((s) => s.type === kind);
    if (!targetStage) {
      toast({
        title: locale === 'pt-BR' ? 'Estágio não encontrado' : 'Stage not found',
        description: locale === 'pt-BR'
          ? `Configure um estágio do tipo "${kind === 'won' ? 'Ganho' : 'Perdido'}" no pipeline.`
          : `Configure a "${kind}" stage in your pipeline.`,
        variant: 'destructive',
      });
      return;
    }

    const closeDate = closeDateOverride || opp.close_date;
    if (!closeDate) {
      // Need to ask user for the close date
      setConfirmAction(null);
      setPendingCloseDate({ kind, opp });
      return;
    }

    setMarkingOpp(true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          status: kind,
          pipeline_stage_id: targetStage.id,
          close_date: closeDate,
          updated_by: userProfile?.id || null,
        } as any)
        .eq('id', opp.id);
      if (error) throw error;
      toast({
        title: kind === 'won'
          ? (locale === 'pt-BR' ? 'Oportunidade marcada como ganha' : 'Opportunity marked as won')
          : (locale === 'pt-BR' ? 'Oportunidade marcada como perdida' : 'Opportunity marked as lost'),
      });
      setContactOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
      setConfirmAction(null);
      setPendingCloseDate(null);
    } catch (err) {
      console.error('Error marking opportunity:', err);
      toast({ title: locale === 'pt-BR' ? 'Erro ao atualizar' : 'Error updating', variant: 'destructive' });
    } finally {
      setMarkingOpp(false);
    }
  };

  const handleMoveStage = async () => {
    if (!moveStageOpp || !moveStageTargetId) return;
    const target = pipelineStages.find((s) => s.id === moveStageTargetId);
    if (!target) return;

    // If target is won/lost, route through existing confirm flow (handles close_date)
    if (target.type === 'won' || target.type === 'lost') {
      const kind = target.type as 'won' | 'lost';
      const opp = moveStageOpp;
      setMoveStageOpp(null);
      setMoveStageTargetId(null);
      setConfirmAction({ kind, opp });
      return;
    }

    setMovingStage(true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          pipeline_stage_id: target.id,
          status: 'open',
          updated_by: userProfile?.id || null,
        } as any)
        .eq('id', moveStageOpp.id);
      if (error) throw error;
      toast({
        title: locale === 'pt-BR' ? 'Etapa atualizada' : 'Stage updated',
        description: locale === 'pt-BR' ? `"${moveStageOpp.title}" movida para ${target.name}.` : `"${moveStageOpp.title}" moved to ${target.name}.`,
      });
      setContactOpportunities((prev) => prev.map((o) => o.id === moveStageOpp.id ? { ...o, pipeline_stage_id: target.id } : o));
      setMoveStageOpp(null);
      setMoveStageTargetId(null);
    } catch (err) {
      console.error('Error moving stage:', err);
      toast({ title: locale === 'pt-BR' ? 'Erro ao mover etapa' : 'Error moving stage', variant: 'destructive' });
    } finally {
      setMovingStage(false);
    }
  };


  // Real-time subscription for messages in the active chat only
  // Thread list realtime is handled by useMessageThreads hook
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
        
        if (newMessage.thread_id === selectedThreadId) {
          const enrichMessage = async () => {
            let enriched = newMessage as Message;
            if (newMessage.reply_to_message_id && !newMessage.reply_to_message) {
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
                const { data } = await supabase
                  .from('messages')
                  .select('content, direction')
                  .eq('id', newMessage.reply_to_message_id)
                  .single();
                if (data) {
                  enriched = { ...newMessage, reply_to_message: data } as Message;
                }
              }
            }
            setMessages((prev) => {
              const filtered = prev.filter((m) => !m.id.startsWith('temp-') && m.id !== enriched.id);
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
        if (updatedMessage.thread_id === selectedThreadId) {
          setMessages((prev) =>
            prev.map((m) => m.id === updatedMessage.id
              ? { ...updatedMessage, reply_to_message: updatedMessage.reply_to_message || m.reply_to_message } as Message
              : m
            )
          );
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organization?.id, selectedThreadId]);

  // 60s timer to recalculate 24h window
  useEffect(() => {
    if (!selectedThread) return;
    
    const checkWindow = () => {
      const lastInboundTime = getLastInboundTime(selectedThread, messages);
      if (lastInboundTime) {
        const hoursDiff = (Date.now() - lastInboundTime.getTime()) / (1000 * 60 * 60);
        setIsIn24hWindow(hoursDiff < 24);
      } else {
        setIsIn24hWindow(false);
      }
    };
    
    const interval = setInterval(checkWindow, 60000);
    return () => clearInterval(interval);
  }, [selectedThread?.id, selectedThread?.last_inbound_at, selectedThread?.whatsapp_last_inbound_at, messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    setReplyingTo(null);
    setIsNoteMode(false);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, direction, sent_at, whatsapp_status, whatsapp_message_sid, media_urls, media_type, error_message, error_code, reply_to_message_id,
          sender_type, sender_name, sender_agent_id, metadata,
          reply_to_message:reply_to_message_id (content, direction)
        `)
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) || []);

      // Fetch inline notes from activities for this contact
      const thread = threads?.find((t) => t.id === threadId)
        ?? (selectedThreadOverride?.id === threadId ? selectedThreadOverride : undefined);
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
            id: n.id,
            body: n.body,
            occurred_at: n.occurred_at,
            created_by_user_id: n.created_by_user_id,
            author_name: n.users?.full_name || null,
          }))
        );
      } else {
        setInlineNotes([]);
      }

      // Check 24h window with 3-level fallback
      const lastInboundTime = getLastInboundTime(thread, (data as Message[]) || []);
      if (lastInboundTime) {
        const hoursDiff = (Date.now() - lastInboundTime.getTime()) / (1000 * 60 * 60);
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

  const handleSendNote = async () => {
    if (!organization?.id || !messageText.trim() || !selectedThread) return;

    const noteText = messageText.trim();
    const tempId = `note-temp-${Date.now()}`;
    const tempNote: InlineNote = {
      id: tempId,
      body: noteText,
      occurred_at: new Date().toISOString(),
      created_by_user_id: userProfile?.id || null,
      author_name: userProfile?.full_name || null,
    };

    setInlineNotes((prev) => [...prev, tempNote]);
    setMessageText('');
    setIsNoteMode(false);
    scrollToBottom();

    try {
      const { error } = await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: selectedThread.contact_id,
        activity_type: 'note' as any,
        title: 'Nota na conversa',
        body: noteText,
        created_by_user_id: userProfile?.id,
        occurred_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (err: any) {
      setInlineNotes((prev) => prev.filter((n) => n.id !== tempId));
      toast({ variant: 'destructive', description: 'Erro ao salvar nota' });
    }
  };

  const handleSendMessage = async () => {
    if (isNoteMode) {
      handleSendNote();
      return;
    }
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
      error_code: null,
      whatsapp_message_sid: null,
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

    // Auto-assign on send
    if (selectedThreadId && selectedThread) {
      autoAssignOnSend(selectedThreadId, selectedThread);
    }

    try {
      const { data, error } = await dispatchWhatsAppSend({
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          message: savedText,
          userId: userProfile?.id,
          replyToMessageId: savedReplyTo?.id || null,
          senderContext: 'messages',
          ...(composerEndpointId ? { endpointId: composerEndpointId } : {}),
          ...(selectedThreadBusinessContext ? { businessContext: selectedThreadBusinessContext } : {}),
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
      error_code: null,
      whatsapp_message_sid: null,
      reply_to_message_id: null,
      reply_to_message: null,
      sender_type: 'user',
      sender_name: userProfile?.full_name || null,
      sender_agent_id: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();

    // Auto-assign on template send
    if (selectedThreadId && selectedThread) {
      autoAssignOnSend(selectedThreadId, selectedThread);
    }

    try {
      const { data, error } = await dispatchWhatsAppSend({
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          templateId,
          templateVariables: variables,
          userId: userProfile?.id,
          senderContext: 'messages',
          ...(composerEndpointId ? { endpointId: composerEndpointId } : {}),
          ...(selectedThreadBusinessContext ? { businessContext: selectedThreadBusinessContext } : {}),
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
      error_code: null,
      whatsapp_message_sid: null,
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

      const { error } = await dispatchWhatsAppSend({
          organizationId: organization.id,
          contactId: selectedThread.contact_id,
          threadId: selectedThreadId,
          message: caption,
          mediaUrl: publicUrl,
          mediaType,
          userId: userProfile?.id,
          replyToMessageId: savedReplyTo?.id || null,
          senderContext: 'messages',
          ...(composerEndpointId ? { endpointId: composerEndpointId } : {}),
          ...(selectedThreadBusinessContext ? { businessContext: selectedThreadBusinessContext } : {}),
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
      const audioFile = audioBlobToFile(audioBlob);
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

  const renderStatusIcon = (message: Message) => (
    <MessageStatusIndicator
      status={message.whatsapp_status}
      errorCode={message.error_code}
      errorMessage={message.error_message}
      sid={message.whatsapp_message_sid}
      sentAt={message.sent_at}
    />
  );

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleReplyClick = (message: Message) => {
    setReplyingTo(message);
  };

  const filteredThreads = threads?.filter((thread) => {
    // Search is applied server-side via rpc_list_message_threads (p_search).
    // Status filter

    // Treat resolved threads with no client reply yet as still "pending" — they
    // were likely auto-resolved or marked too early and the client never replied.
    const isPendingFirstReply = thread.status === 'resolved' && !thread.last_inbound_at && !thread.whatsapp_last_inbound_at;
    const isOpenLike = ['open', 'awaiting_client', 'in_progress'].includes(thread.status) || isPendingFirstReply;
    switch (effectiveFilter) {
      case 'mine':
        return thread.assigned_user_id === userProfile?.id && isOpenLike;
      case 'unassigned':
        return !thread.assigned_user_id && (thread.status === 'open' || isPendingFirstReply);
      case 'all_open':
        return isOpenLike;
      case 'resolved':
        return thread.status === 'resolved' && (thread.last_inbound_at || thread.whatsapp_last_inbound_at);
      default:
        return true;
    }
  });

  // Hidden threads (per-user, with 5s undo)
  const { hideThread, unhideThread, isHidden } = useHiddenThreads(userProfile?.id);
  const visibleThreads = filteredThreads
    ?.filter((t) => !isHidden(t.id, t.last_inbound_at || t.whatsapp_last_inbound_at))
    .filter((t) => endpointFilter === 'all' || threadEndpointMap[t.id] === endpointFilter);

  const visibleThreadsWithSelected = selectedThreadOverride
    && selectedThreadId === selectedThreadOverride.id
    && !(visibleThreads ?? []).some((t) => t.id === selectedThreadOverride.id)
      ? [selectedThreadOverride, ...(visibleThreads ?? [])]
      : visibleThreads;

  const loadThreadForSelection = async (
    threadId: string,
    fallbackEndpointId: string | null,
  ): Promise<(ChatThread & { primary_endpoint_id?: string | null }) | null> => {
    if (!organization?.id) return null;

    const { data: row, error } = await supabase
      .from('message_threads')
      .select('id, contact_id, status, updated_at, whatsapp_last_inbound_at, last_inbound_at, needs_human_attention, assigned_user_id, primary_endpoint_id, last_message_content, last_message_direction')
      .eq('organization_id', organization.id)
      .eq('id', threadId)
      .maybeSingle();

    if (error) {
      console.error('Error loading selected thread:', error);
      return null;
    }
    if (!row) return null;

    const { data: contact } = await supabase
      .from('contacts')
      .select('full_name, phone')
      .eq('id', (row as any).contact_id)
      .maybeSingle();

    return {
      id: (row as any).id,
      contact_id: (row as any).contact_id,
      contact_name: (contact as any)?.full_name || (contact as any)?.phone || 'Desconhecido',
      contact_phone: (contact as any)?.phone ?? null,
      last_message: (row as any).last_message_content || '...',
      last_message_direction: (row as any).last_message_direction ?? null,
      updated_at: (row as any).updated_at,
      whatsapp_last_inbound_at: (row as any).whatsapp_last_inbound_at ?? null,
      last_inbound_at: (row as any).last_inbound_at ?? null,
      unread: false,
      needs_human_attention: (row as any).needs_human_attention ?? false,
      status: (row as any).status || 'open',
      assigned_user_id: (row as any).assigned_user_id ?? null,
      assigned_user_name: null,
      primary_endpoint_id: (row as any).primary_endpoint_id ?? fallbackEndpointId,
    };
  };

  const handleHideThread = (threadId: string) => {
    const thread = threads?.find((t) => t.id === threadId);
    const name = thread?.contact_name || (locale === 'pt-BR' ? 'Conversa' : 'Conversation');
    hideThread(threadId);
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
    toast({
      title: locale === 'pt-BR' ? 'Conversa ocultada' : 'Conversation hidden',
      description: name,
      duration: 5000,
      action: (
        <ToastAction
          altText={locale === 'pt-BR' ? 'Desfazer' : 'Undo'}
          onClick={() => unhideThread(threadId)}
        >
          {locale === 'pt-BR' ? 'Desfazer' : 'Undo'}
        </ToastAction>
      ),
    });
  };

  const allFilterOptions: { key: ThreadFilter; label: string; requiresViewAll?: boolean }[] = [
    { key: 'mine', label: locale === 'pt-BR' ? 'Minhas' : 'Mine' },
    { key: 'unassigned', label: locale === 'pt-BR' ? 'Não atribuídas' : 'Unassigned' },
    { key: 'all_open', label: locale === 'pt-BR' ? 'Todas abertas' : 'All Open', requiresViewAll: true },
    { key: 'resolved', label: locale === 'pt-BR' ? 'Resolvidas' : 'Resolved', requiresViewAll: true },
  ];
  const filterOptions = allFilterOptions.filter(o => !o.requiresViewAll || permissions.viewAllThreads);

  // Force "mine"/"unassigned" for users without view-all
  useEffect(() => {
    if (!permissions.viewAllThreads && effectiveFilter !== 'mine' && effectiveFilter !== 'unassigned') {
      setFilter('mine');
    }
  }, [permissions.viewAllThreads, effectiveFilter]);


  return (
    <Layout>
      <div className="h-screen overflow-hidden flex">
        {/* Left Panel - Chat List (fixed width) */}
        <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col bg-card h-full overflow-hidden">
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
                    onClick={handleExportConversations}
                    disabled={isExporting}
                    title={locale === 'pt-BR' ? 'Exportar conversas (oportunidades ganhas)' : 'Export conversations (won opportunities)'}
                  >
                    {isExporting ? <SpinnerGap className="w-4 h-4 animate-spin" /> : <DownloadSimple className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowNewConversation(true)}
                    title={locale === 'pt-BR' ? 'Nova Conversa' : 'New Conversation'}
                  >
                    <ChatCircleDots className="w-4 h-4" />
                  </Button>
                  {hasMultipleEndpoints && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 relative"
                      onClick={() => setEndpointFilterOpen(true)}
                      title={locale === 'pt-BR' ? 'Filtrar por número' : 'Filter by number'}
                    >
                      <FunnelSimple className="w-4 h-4" />
                      {endpointFilter !== 'all' && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </Button>
                  )}
                  <Badge color="gray" size="md">
                    {visibleThreadsWithSelected?.length || 0}
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
              <div className="flex gap-1.5 flex-wrap">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilter(opt.key)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                      effectiveFilter === opt.key
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
              ) : visibleThreadsWithSelected?.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <p className="text-sm">
                    {locale === 'pt-BR' ? 'Nenhuma conversa' : 'No conversations'}
                  </p>
                </div>
              ) : (
                <>
                  <ListBox
                    aria-label="Conversations"
                    selectionMode="single"
                    selectedKeys={selectedThreadId ? new Set([selectedThreadId]) : new Set()}
                    onSelectionChange={(keys) => {
                      const keysArray = Array.from(keys);
                      const key = keysArray[0] as string;
                      if (key !== selectedThreadOverride?.id) {
                        setSelectedThreadOverride(null);
                      }
                      setSelectedThreadId(key || null);
                      if (key) markThreadRead(key);
                    }}
                  >
                    {(visibleThreadsWithSelected || []).map((thread) => (
                      <ChatListItem
                        key={thread.id}
                        value={thread}
                        locale={locale as 'pt-BR' | 'en-US'}
                        onHide={handleHideThread}
                        endpointAddress={
                          hasMultipleEndpoints
                            ? endpointById[threadEndpointMap[thread.id] ?? (thread.id === selectedThreadOverride?.id ? selectedThreadOverride.primary_endpoint_id ?? '' : '')]?.external_address ?? null
                            : null
                        }
                        endpointPurpose={
                          endpointById[threadEndpointMap[thread.id] ?? (thread.id === selectedThreadOverride?.id ? selectedThreadOverride.primary_endpoint_id ?? '' : '')]?.purpose ?? null
                        }
                        officialNumbers={officialNumbers}
                      />
                    ))}
                  </ListBox>
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
                </>
              )}
            </ScrollArea>
        </div>

        {/* Right Panel - Chat */}
        <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
            {selectedThread ? (
              <>
                {/* Chat Header */}
                <div className="border-b border-border px-6 py-3">
                  <div className="flex items-center justify-between gap-4">
                    {/* Contact info — flex-1 with min-w-0 so name truncates instead of wrapping */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar fallbackText={selectedThread.contact_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Link
                            to={`/contacts/${selectedThread.contact_id}`}
                            className="font-semibold text-foreground truncate hover:text-primary hover:underline transition-colors"
                            title={locale === 'pt-BR' ? 'Ver perfil do contato' : 'View contact profile'}
                          >
                            {selectedThread.contact_name}
                          </Link>
                          {hasMultipleEndpoints && selectedThreadEndpoint && (
                            <EndpointBadge externalAddress={selectedThreadEndpoint.external_address} purpose={selectedThreadEndpoint.purpose ?? null} size="lg" />
                          )}
                          {isIn24hWindow && (
                            <BadgeWithDot color="success" size="sm" className="shrink-0">
                              {locale === 'pt-BR' ? 'Online' : 'Online'}
                            </BadgeWithDot>
                          )}
                          {selectedThread.status && statusConfig[selectedThread.status] && (
                            <span className={cn('text-xs font-medium shrink-0', statusConfig[selectedThread.status].color)}>
                              {locale === 'pt-BR' ? statusConfig[selectedThread.status].label : statusConfig[selectedThread.status].labelEn}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedThread.contact_phone}
                          {selectedEndpointIdentity && (
                            <span> · {selectedEndpointIdentity}</span>
                          )}
                          {selectedThread.assigned_user_name && (
                            <span> · {locale === 'pt-BR' ? 'Atribuída a' : 'Assigned to'} {selectedThread.assigned_user_name}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Actions — single "More" menu with all actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" title={locale === 'pt-BR' ? 'Ações' : 'Actions'}>
                            <DotsHorizontal className="w-4 h-4 xl:mr-1" />
                            <span className="hidden xl:inline">{locale === 'pt-BR' ? 'Ações' : 'Actions'}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          {/* Atribuição */}
                          <DropdownMenuLabel>
                            {locale === 'pt-BR' ? 'Atribuição' : 'Assignment'}
                          </DropdownMenuLabel>
                          {(!selectedThread.assigned_user_id || selectedThread.assigned_user_id !== userProfile?.id) && selectedThread.status !== 'resolved' && (
                            <DropdownMenuItem onClick={() => handleTakeOver(selectedThread.id)}>
                              <UserCheck className="w-4 h-4 mr-2" />
                              {locale === 'pt-BR' ? 'Assumir conversa' : 'Take over'}
                            </DropdownMenuItem>
                          )}
                          <div className="px-2 py-1.5">
                            <OwnerSelector
                              value={selectedThread.assigned_user_id}
                              onChange={(userId) => handleAssign(selectedThread.id, userId)}
                              size="sm"
                              placeholder={locale === 'pt-BR' ? 'Atribuir a...' : 'Assign to...'}
                            />
                          </div>

                          <DropdownMenuSeparator />

                          {/* Status da conversa */}
                          <DropdownMenuLabel>
                            {locale === 'pt-BR' ? 'Conversa' : 'Conversation'}
                          </DropdownMenuLabel>
                          {['open', 'awaiting_client', 'in_progress'].includes(selectedThread.status) && (
                            <DropdownMenuItem onClick={() => handleResolve(selectedThread.id)}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {locale === 'pt-BR' ? 'Resolver conversa' : 'Resolve'}
                            </DropdownMenuItem>
                          )}
                          {selectedThread.status === 'resolved' && (
                            <DropdownMenuItem onClick={() => handleReopen(selectedThread.id)}>
                              <ArrowCounterClockwise className="w-4 h-4 mr-2" />
                              {locale === 'pt-BR' ? 'Reabrir conversa' : 'Reopen'}
                            </DropdownMenuItem>
                          )}
                          {selectedThread.needs_human_attention && hasAIAgent && (
                            <DropdownMenuItem onClick={() => handleReturnToAI(selectedThread.id)}>
                              <Robot className="w-4 h-4 mr-2" />
                              {locale === 'pt-BR' ? 'Devolver ao AI' : 'Return to AI'}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link to={`/contacts/${selectedThread.contact_id}`}>
                              <User01 className="w-4 h-4 mr-2" />
                              {locale === 'pt-BR' ? 'Ver perfil' : 'View profile'}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleHideThread(selectedThread.id)}>
                            <EyeSlash className="w-4 h-4 mr-2" />
                            {locale === 'pt-BR' ? 'Ocultar conversa' : 'Hide conversation'}
                          </DropdownMenuItem>

                          {/* Oportunidades */}
                          {contactOpportunities.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>
                                {locale === 'pt-BR' ? 'Oportunidades' : 'Opportunities'}
                              </DropdownMenuLabel>
                              {contactOpportunities.map((opp, idx) => (
                                <Fragment key={opp.id}>
                                  {idx > 0 && <DropdownMenuSeparator />}
                                  <div className="px-2 py-1 text-xs text-muted-foreground truncate">
                                    {opp.title}
                                  </div>
                                  <DropdownMenuItem onClick={() => setConfirmAction({ kind: 'won', opp })}>
                                    <TrendUp className="w-4 h-4 mr-2 text-green-600" />
                                    {locale === 'pt-BR' ? 'Marcar como Ganho' : 'Mark as Won'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setConfirmAction({ kind: 'lost', opp })}>
                                    <TrendDown className="w-4 h-4 mr-2 text-red-600" />
                                    {locale === 'pt-BR' ? 'Marcar como Perdido' : 'Mark as Lost'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setMoveStageTargetId(opp.pipeline_stage_id); setMoveStageOpp(opp); }}>
                                    <ArrowsLeftRight className="w-4 h-4 mr-2" />
                                    {locale === 'pt-BR' ? 'Mover etapa…' : 'Move stage…'}
                                  </DropdownMenuItem>
                                </Fragment>
                              ))}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>


                {/* Messages Area */}
                {showTemplates ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <WhatsAppTemplateSelector
                      onSelect={handleSendTemplate}
                      onCancel={() => setShowTemplates(false)}
                      provider={resolveComposerProvider({
                        organizationId: organization?.id,
                        senderContext: 'messages',
                        resolvedProvider: selectedThreadWaProvider,
                        businessContext: selectedThreadBusinessContext,
                        threadPrimaryPurpose: primaryEndpointPurpose,
                      }) === 'meta_cloud_api' ? 'meta_cloud_api' : undefined}
                    />
                  </div>
                ) : (
                  <>
                    <ScrollArea className="flex-1">
                      {messagesLoading ? (
                        <div className="p-6 space-y-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                              <Skeleton className="h-16 w-48 rounded-lg" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 space-y-3">
                          {/* Merge messages and notes chronologically */}
                          {(() => {
                            const chatItems: ChatItem[] = [
                              ...messages.map((m) => ({ _type: 'message' as const, data: m })),
                              ...inlineNotes.map((n) => ({ _type: 'note' as const, data: n })),
                            ].sort((a, b) => {
                              const dateA = a._type === 'message' ? a.data.sent_at : a.data.occurred_at;
                              const dateB = b._type === 'message' ? b.data.sent_at : b.data.occurred_at;
                              return new Date(dateA).getTime() - new Date(dateB).getTime();
                            });

                            const formatDateSeparator = (dateStr: string) => {
                              const d = new Date(dateStr);
                              const today = new Date();
                              const yesterday = new Date();
                              yesterday.setDate(today.getDate() - 1);
                              const sameDay = (a: Date, b: Date) =>
                                a.getFullYear() === b.getFullYear() &&
                                a.getMonth() === b.getMonth() &&
                                a.getDate() === b.getDate();
                              if (sameDay(d, today)) return locale === 'pt-BR' ? 'HOJE' : 'TODAY';
                              if (sameDay(d, yesterday)) return locale === 'pt-BR' ? 'ONTEM' : 'YESTERDAY';
                              const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
                              if (diffDays < 7 && diffDays >= 0) {
                                return d.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
                              }
                              return d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
                            };

                            let lastDateKey: string | null = null;

                            return chatItems.map((item) => {
                              const itemDate = item._type === 'message' ? item.data.sent_at : item.data.occurred_at;
                              const dateKey = new Date(itemDate).toDateString();
                              const showSeparator = dateKey !== lastDateKey;
                              lastDateKey = dateKey;

                              const separator = showSeparator ? (
                                <div key={`sep-${dateKey}`} className="flex justify-center my-3">
                                  <div className="px-3 py-1 rounded-full bg-muted/70 text-muted-foreground text-[11px] font-medium tracking-wide shadow-sm">
                                    {formatDateSeparator(itemDate)}
                                  </div>
                                </div>
                              ) : null;

                              const renderItem = (() => {
                              if (item._type === 'note') {
                                const note = item.data;
                                return (
                                  <div key={`note-${note.id}`} className="flex justify-center">
                                    <div className="max-w-[70%] rounded-lg p-3 min-w-[80px] overflow-hidden bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
                                      <div className="flex items-center gap-1 mb-1">
                                        <NotePencil className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                                        <span className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400">Nota interna</span>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap break-all text-yellow-900 dark:text-yellow-100">
                                        {note.body}
                                      </p>
                                      <div className="mt-1 flex items-center justify-end gap-1">
                                        <span className="text-[10px] text-yellow-600/70 dark:text-yellow-400/70 whitespace-nowrap">
                                          {note.author_name ? `${note.author_name} · ` : ''}
                                          {new Date(note.occurred_at).toLocaleTimeString(locale, {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: false
                                          })}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              const message = item.data;

                              const _migMetaKind =
                                message.metadata && typeof message.metadata === 'object'
                                  ? (message.metadata as any).kind
                                  : null;
                              const isEndpointMigration =
                                _migMetaKind === 'endpoint_migration_meta_7020' ||
                                _migMetaKind === 'endpoint_provider_migration';

                              if (isEndpointMigration) {
                                const migrationAuditLine = formatEndpointMigrationAuditLine(message.metadata, selectedThreadEndpoint);
                                return (
                                  <div key={`sys-${message.id}`} className="flex justify-center my-3">
                                    <div className="max-w-[80%] px-3 py-1.5 rounded-full bg-muted/70 text-muted-foreground text-[11px] font-medium tracking-wide text-center shadow-sm space-y-0.5">
                                      <div>{message.content}</div>
                                      {migrationAuditLine && (
                                        <div className="font-data text-[10px] normal-case tracking-normal">
                                          {migrationAuditLine}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              const isOutbound = message.direction === 'outbound';

                              return (
                                <div
                                  key={message.id}
                                  className={cn(
                                    'flex items-end gap-2 group',
                                    isOutbound ? 'justify-end' : 'justify-start'
                                  )}
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
                                      'relative max-w-[70%] rounded-lg min-w-[80px] overflow-hidden',
                                      message.media_type === 'audio' ? 'p-1' : 'p-3',
                                      isOutbound
                                        ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                                        : 'bg-card border border-border text-foreground shadow-sm'
                                    )}
                                  >
                                    {/* Agent Badge + Feedback Button for agent messages */}
                                    {isOutbound && message.sender_type === 'agent' && (
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge color="purple" size="sm" icon={<Robot className="w-3 h-3" />}>
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
                                          <ChatCircleDots className="w-3 h-3 mr-1" />
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
                                        {message.media_urls.map((rawUrl, i) => {
                                          const url = getProxiedMediaUrl(rawUrl, organization?.id, accessToken);
                                          if (message.media_type === 'audio' || rawUrl.match(/\.(ogg|mp3|wav|m4a)$/i)) {
                                            const isAudioOnly = message.media_type === 'audio';
                                            const senderLabel = isOutbound
                                              ? (message.sender_name ? `${message.sender_name} · ` : '')
                                              : '';
                                            const timeStr = new Date(message.sent_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
                                            const audioTimestamp = `${senderLabel}${timeStr}`;
                                            return <AudioMessagePlayer key={i} src={url}
                                              messageId={message.id}
                                              threadId={(message as any).thread_id}
                                              mediaType={message.media_type}
                                              timestamp={isAudioOnly ? audioTimestamp : undefined}
                                              statusIcon={isAudioOnly && isOutbound ? renderStatusIcon(message) : undefined}
                                            />;
                                          }
                                          if (message.media_type === 'image' || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
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
                                       ['📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo', '📎 Media', '📷 Image', '🎵 Audio', '🎬 Video',
                                        '[Áudio]', '[Imagem]', '[Vídeo]', '[Documento]', '[Sticker]'].includes(message.content)) && (
                                      <p className="text-sm whitespace-pre-wrap break-all">
                                        {message.content}
                                      </p>
                                    )}

                                    {/* Inline failure reason */}
                                    {message.whatsapp_status === 'failed' && (
                                      <MessageFailureInline errorCode={message.error_code} />
                                    )}

                                    {/* Footer - Name + Time + Status (hidden for audio-only, rendered inside player) */}
                                    {!(message.media_type === 'audio') && (
                                    <div className="mt-1 flex items-center justify-end gap-1">
                                      <span className="text-[11px] leading-[14px] text-muted-foreground/70 whitespace-nowrap">
                                        {isOutbound 
                                          ? (message.sender_name ? `${message.sender_name} · ` : '')
                                          : ''
                                        }
                                        {new Date(message.sent_at).toLocaleTimeString(locale, {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: false
                                        })}
                                      </span>
                                      {isOutbound && renderStatusIcon(message)}
                                    </div>
                                    )}
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
                              })();

                              return (
                                <Fragment key={item._type === 'message' ? `m-${item.data.id}` : `n-${item.data.id}`}>
                                  {separator}
                                  {renderItem}
                                </Fragment>
                              );
                            });
                          })()}
                          <div ref={scrollRef} />
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="border-t border-border p-4 bg-card">
                      {(() => {
                        const outOfWindow = !isIn24hWindow && messages.length > 0;
                        return (
                          <>
                          {/* Note Mode Indicator */}
                          {!outOfWindow && isNoteMode && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-t-lg">
                              <NotePencil className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                              <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                                {locale === 'pt-BR' ? 'Nota interna - não será enviada ao cliente' : 'Internal note - will not be sent to client'}
                              </span>
                              <button onClick={() => setIsNoteMode(false)} className="ml-auto">
                                <XClose className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                              </button>
                            </div>
                          )}

                          {/* Reply Preview */}
                          {!outOfWindow && replyingTo && !isNoteMode && (
                            <ReplyPreview
                              message={replyingTo}
                              onClose={() => setReplyingTo(null)}
                            />
                          )}



                          <div className={cn(
                            "flex gap-2",
                            !outOfWindow && replyingTo && !isNoteMode && "border border-t-0 border-border rounded-b-lg p-2 bg-card",
                            !outOfWindow && isNoteMode && "border border-t-0 border-yellow-300 dark:border-yellow-700 rounded-b-lg p-2 bg-yellow-50 dark:bg-yellow-900/20"
                          )}>
                            <div className="flex gap-1">
                              {outOfWindow ? (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setShowTemplates(true)}
                                  title={locale === 'pt-BR' ? 'Selecionar template (fora da janela de 24h)' : 'Select template (outside 24h window)'}
                                  className="h-10 w-10"
                                >
                                  <FileText className="h-5 w-5" />
                                </Button>
                              ) : (
                                <>
                                  <MediaUploadButton onFileSelected={handleFileSelected} onTemplateClick={() => setShowTemplates(true)} onNoteClick={() => setIsNoteMode(true)} disabled={submitting || mediaUploading} />
                                  <AudioRecorder onSend={handleAudioSend} disabled={submitting || mediaUploading} />

                                  {/* Emoji Picker */}
                                  <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
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
                                </>
                              )}
                            </div>
                            <div className="relative flex-1">
                              <Textarea
                                ref={textareaRef}
                                placeholder={outOfWindow
                                  ? (locale === 'pt-BR' ? 'Fora da janela de 24h — selecione um template' : 'Outside 24h window — select a template')
                                  : isNoteMode
                                    ? (locale === 'pt-BR' ? 'Escreva uma nota interna...' : 'Write an internal note...')
                                    : (locale === 'pt-BR' ? 'Digite uma mensagem...' : 'Type a message...')}
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
                                disabled={outOfWindow}
                                className={`w-full resize-none min-h-[40px] max-h-[150px] pr-10 ${textareaOverflow ? 'overflow-y-auto' : 'overflow-hidden'}`}
                              />

                              {/* AI Improve Button */}
                              {!outOfWindow && hasAIIntegration && (
                                <DropdownMenu open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                      disabled={!messageText.trim() || aiImproving}
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
                                      <TextAa className="h-4 w-4 mr-2" />
                                      {locale === 'pt-BR' ? 'Corrigir gramática' : 'Fix grammar'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleImproveText('professional')}>
                                      <Briefcase className="h-4 w-4 mr-2" />
                                      {locale === 'pt-BR' ? 'Tornar profissional' : 'Make professional'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
                                      <Smiley className="h-4 w-4 mr-2" />
                                      {locale === 'pt-BR' ? 'Tornar amigável' : 'Make friendly'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleImproveText('persuasive')}>
                                      <Target className="h-4 w-4 mr-2" />
                                      {locale === 'pt-BR' ? 'Tornar persuasivo' : 'Make persuasive'}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                            <Button
                              onClick={handleSendMessage}
                              disabled={outOfWindow || submitting || !messageText.trim()}
                              size="icon"
                              className={cn(
                                "shrink-0",
                                isNoteMode
                                  ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                                  : "bg-green-600 hover:bg-green-700"
                              )}
                            >
                              {submitting ? (
                                <SpinnerGap className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send01 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          </>
                        );
                      })()}
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
        intent="sales"
        onSelectContact={async (_contactId, threadId, endpointId) => {
          setSearchQuery('');
          if (endpointFilter !== 'all' && endpointFilter !== endpointId) {
            setEndpointFilter('all');
          }

          const loadedThread = await loadThreadForSelection(threadId, endpointId);
          setSelectedThreadOverride(loadedThread);
          setSelectedThreadId(threadId);
          await refetchThreads();
          setSelectedThreadId(threadId);
        }}
      />

      <EndpointFilterDialog
        open={endpointFilterOpen}
        onOpenChange={setEndpointFilterOpen}
        endpoints={orgEndpoints}
        officialNumbers={officialNumbers}
        value={endpointFilter}
        onChange={setEndpointFilter}
      />

      {/* Confirm Mark Won/Lost */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={
          confirmAction?.kind === 'won'
            ? (locale === 'pt-BR' ? 'Marcar como Ganho' : 'Mark as Won')
            : (locale === 'pt-BR' ? 'Marcar como Perdido' : 'Mark as Lost')
        }
        description={
          confirmAction
            ? (locale === 'pt-BR'
                ? `Deseja marcar a oportunidade "${confirmAction.opp.title}" como ${confirmAction.kind === 'won' ? 'ganha' : 'perdida'}?`
                : `Mark opportunity "${confirmAction.opp.title}" as ${confirmAction.kind}?`)
            : ''
        }
        confirmText={locale === 'pt-BR' ? 'Confirmar' : 'Confirm'}
        cancelText={locale === 'pt-BR' ? 'Cancelar' : 'Cancel'}
        variant={confirmAction?.kind === 'lost' ? 'destructive' : 'default'}
        loading={markingOpp}
        onConfirm={() => confirmAction && handleMarkOpportunity(confirmAction.kind, confirmAction.opp)}
      />

      <CloseDatePromptDialog
        open={!!pendingCloseDate}
        onOpenChange={(o) => !o && setPendingCloseDate(null)}
        title={
          pendingCloseDate?.kind === 'won'
            ? (locale === 'pt-BR' ? 'Marcar como Ganho' : 'Mark as Won')
            : (locale === 'pt-BR' ? 'Marcar como Perdido' : 'Mark as Lost')
        }
        loading={markingOpp}
        onConfirm={(date) => pendingCloseDate && handleMarkOpportunity(pendingCloseDate.kind, pendingCloseDate.opp, date)}
      />

      {/* Move stage dialog */}
      <Dialog
        open={!!moveStageOpp}
        onOpenChange={(o) => { if (!o) { setMoveStageOpp(null); setMoveStageTargetId(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{locale === 'pt-BR' ? 'Mover etapa' : 'Move stage'}</DialogTitle>
            <DialogDescription>
              {moveStageOpp
                ? (locale === 'pt-BR'
                    ? `Escolha a nova etapa para "${moveStageOpp.title}".`
                    : `Choose the new stage for "${moveStageOpp.title}".`)
                : ''}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={moveStageTargetId ?? ''}
            onValueChange={(v) => setMoveStageTargetId(v)}
            className="max-h-[50vh] overflow-y-auto py-1"
          >
            {pipelineStages.map((s) => {
              const isCurrent = moveStageOpp?.pipeline_stage_id === s.id;
              const typeLabel = s.type === 'won'
                ? (locale === 'pt-BR' ? 'Ganho' : 'Won')
                : s.type === 'lost'
                ? (locale === 'pt-BR' ? 'Perdido' : 'Lost')
                : (locale === 'pt-BR' ? 'Aberto' : 'Open');
              const badgeColor: 'success' | 'error' | 'gray' = s.type === 'won' ? 'success' : s.type === 'lost' ? 'error' : 'gray';
              return (
                <Label
                  key={s.id}
                  htmlFor={`stage-${s.id}`}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent ${isCurrent ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RadioGroupItem id={`stage-${s.id}`} value={s.id} disabled={isCurrent} />
                    <span className="truncate text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrent && (
                      <span className="text-xs text-muted-foreground">{locale === 'pt-BR' ? 'atual' : 'current'}</span>
                    )}
                    <Badge color={badgeColor} className="text-[10px]">{typeLabel}</Badge>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setMoveStageOpp(null); setMoveStageTargetId(null); }}
              disabled={movingStage}
            >
              {locale === 'pt-BR' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleMoveStage}
              disabled={movingStage || !moveStageTargetId || moveStageTargetId === moveStageOpp?.pipeline_stage_id}
            >
              {movingStage
                ? (locale === 'pt-BR' ? 'Movendo…' : 'Moving…')
                : (locale === 'pt-BR' ? 'Confirmar' : 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

export default function MessagesList() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileMessagesList />;
  return <DesktopMessagesList />;
}
