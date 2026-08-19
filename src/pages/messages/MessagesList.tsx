import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { dispatchWhatsAppSend } from "@/lib/dispatchWhatsAppSend";
import { toErrorMessageString } from "@/lib/errorMessage";

import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileMessagesList } from '@/components/mobile/MobileMessagesList';
import {
  DotsHorizontal,
  FaceSmile,
  
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
// Fase 2.5 — UI Comercial (Route/número/provider). Somente leitura.
import { RouteBadge, type EndpointState } from '@/components/messages/route/RouteIndicators';
import { SalesRouteDetailsDialog } from '@/components/messages/route/SalesRouteDetailsDialog';
import { SalesConversationHeader } from '@/components/messages/route/SalesConversationHeader';
import { SalesComposerStatus } from '@/components/messages/route/SalesComposerStatus';
import { ManualReplySelector } from '@/components/messages/route/ManualReplySelector';
import { useManualReplyEndpoint } from '@/hooks/messages/useManualReplyEndpoint';
import { useInvalidateThreadLastEndpoint } from '@/hooks/messages/useThreadLastEndpoint';
import { Warning } from '@phosphor-icons/react';
import { useSalesRoute } from '@/hooks/messages/useSalesRoute';
import { useConsolidatedThreadIds } from '@/hooks/messages/useConsolidatedThreadIds';

import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useWhatsAppProvider } from '@/hooks/useWhatsAppProvider';
import { useThreadBusinessContext, type ThreadBusinessContext } from '@/hooks/useThreadBusinessContext';
import { resolveComposerProvider } from '@/lib/resolveComposerProvider';
import { useThreadSendEndpoint } from '@/hooks/useThreadSendEndpoint';
import { useEndpointNumbers } from '@/hooks/useEndpointNumbers';
import { pickPreferredEndpoint, filterEndpointsByIntent } from '@/lib/composerEndpoint';
import { isSalesPurpose } from '@/lib/endpointPurpose';
import { SpinnerGap, Check, Checks, Clock, WarningCircle, Sparkle, Briefcase, Smiley, Robot, ChatCircleDots, FileText, Target, UserCheck, CheckCircle, ArrowCounterClockwise, ArrowsLeftRight, Note, DownloadSimple, NotePencil, TextAa, TrendUp, TrendDown } from '@phosphor-icons/react';
import { MessageStatusIndicator, MessageFailureInline } from '@/components/whatsapp/MessageStatusIndicator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CloseDatePromptDialog } from '@/components/opportunities/CloseDatePromptDialog';
import { OpportunityCloseDialog } from '@/components/opportunities/OpportunityCloseDialog';
import { transitionOpportunityStage } from '@/lib/opportunityClose';
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
import { useServiceWindow } from '@/hooks/useServiceWindow';
import { WhatsAppWindowChip } from '@/components/inbox/WhatsAppWindowChip';
import { LowQualityEndpointBanner } from '@/components/inbox/LowQualityEndpointBanner';
import { assertTemplateAllowedForEndpoint, checkTemplateRateLimit, isLowEndpointWindowBlocked, LOW_ENDPOINT_WINDOW_OPEN_MESSAGE } from '@/lib/complianceGuards';
import { logComplianceBlock } from '@/lib/complianceLog';
import { useSnippets, bumpSnippetUsage, type MessageSnippet } from '@/hooks/useSnippets';
import { interpolateSnippet, buildSnippetVars } from '@/lib/interpolateSnippet';
import { SnippetsPickerPanel, extractSnippetQuery } from '@/components/whatsapp/SnippetsPicker';
import { useAI } from '@/hooks/useAI';
import { useMessageThreads, type ChatThread } from '@/hooks/useMessageThreads';
import { useOrgWhatsAppEndpoints } from '@/hooks/useOrgWhatsAppEndpoints';
import { useThreadEndpointMap } from '@/hooks/useThreadEndpointMap';
import { useThreadBadgeEndpoints } from '@/hooks/useThreadBadgeEndpoints';
import { useThreadLastMessageMeta } from '@/hooks/messages/useThreadLastMessageMeta';
import { LastMessagePreview } from '@/components/messages/LastMessagePreview';
import { EndpointBadge } from '@/components/messages/EndpointBadge';
import { MetaRichMessageContent } from '@/components/messages/MetaRichMessageContent';
import { EndpointFilterDialog } from '@/components/messages/EndpointFilterDialog';
import { TimelineEventMarker } from '@/components/messages/timeline/TimelineEventMarker';
import { FunnelSimple } from '@phosphor-icons/react';
import { formatEndpointIdentity, formatEndpointMigrationAuditLine, whatsappProviderLabel, whatsappProviderShortLabel } from '@/lib/whatsappEndpointDisplay';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

import { useHiddenThreads } from '@/hooks/useHiddenThreads';
import { EyeSlash, Paperclip, Plus } from '@phosphor-icons/react';
import { ToastAction } from '@/components/ui/toast';
import { AttachMediaDialog, type AttachMedia } from '@/components/documents/AttachMediaDialog';
import { isAttachableMedia } from '@/lib/mediaToFile';
import { computeMessageGroups, computeContextBlocks, type GroupingItem } from '@/lib/messageGrouping';
import { TimelineBlock } from '@/components/messages/timeline/TimelineBlock';

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
  /** Identificador estável do operador — usado apenas para agrupamento visual. */
  sender_user_id?: string | null;
  metadata?: Record<string, any> | null;
  endpoint_id?: string | null;
}

interface InlineNote {
  id: string;
  body: string | null;
  occurred_at: string;
  created_by_user_id: string | null;
  author_name?: string;
  /** Título da activity — usado para classificar eventos de sistema. */
  title?: string | null;
}

/**
 * Títulos de activities gravadas por triggers/automações (não são notas
 * escritas por pessoas). Classificação por TIPO, nunca por autor.
 */
const SYSTEM_ACTIVITY_TITLES = new Set(
  [
    'Atribuicao automatica',
    'Atribuição automática',
    'Distribuicao automatica',
    'Distribuição automática',
    'Round-robin',
    'Automacao',
    'Automação',
  ].map((t) => t.toLowerCase()),
);

function isSystemActivity(title: string | null | undefined): boolean {
  if (!title) return false;
  return SYSTEM_ACTIVITY_TITLES.has(title.trim().toLowerCase());
}


/** Marco histórico do CRM na timeline (puramente apresentacional). */
interface TimelineEvent {
  id: string;
  occurred_at: string;
  label: string;
  value?: string | null;
}

type ChatItem = 
  | { _type: 'message'; data: Message }
  | { _type: 'note'; data: InlineNote }
  | { _type: 'event'; data: TimelineEvent };


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
  endpointProvider?: string | null;
  /** Estado real do endpoint de resposta (ativo/inativo). */
  endpointIsActive?: boolean | null;
  officialNumbers?: Set<string>;
  /** Metadados da última mensagem (preview) — resolvidos em lote. */
  lastMessageMediaType?: string | null;
  lastMessageStatus?: string | null;
}

const ChatListItem = ({ value, locale, className, onHide, endpointAddress, endpointPurpose, endpointProvider, endpointIsActive, officialNumbers, lastMessageMediaType, lastMessageStatus, ...otherProps }: ChatListItemProps) => {
  if (!value) return null;

  const status = statusConfig[value.status] || statusConfig.open;

  return (
    <ListBoxItem
      {...otherProps}
      id={value.id}
      textValue={value.contact_name}
      className={(state) =>
        cn(
          'group relative flex items-center gap-3 border-b border-border/60 py-2.5 px-3 select-none cursor-pointer',
          state.isFocused && 'outline-2 -outline-offset-2 outline-ring',
          state.isSelected && 'bg-accent',
          typeof className === 'function' ? className(state) : className
        )
      }
    >
      <Avatar fallbackText={value.contact_name} size="md" />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">
              {value.contact_name}
            </span>
            {/* Fase Final — badge compacto com estado REAL do endpoint */}
            <RouteBadge
              address={endpointAddress ?? null}
              provider={endpointProvider ?? null}
              /* Estado nunca derivado de campo legado: sem dado de endpoint o
                 badge fica indeterminado (não renderiza aviso de legado). */
              state={!endpointAddress ? 'unknown' : endpointIsActive === false ? 'offline' : 'online'}
              variant="compact"
            />

            {(value.unread) && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground leading-5">
            {formatRelativeTime(value.updated_at, locale)}
          </span>
        </div>
        {/* Preview da última mensagem (estilo WhatsApp) */}
        <LastMessagePreview
          className="mt-0.5"
          content={value.last_message}
          direction={value.last_message_direction}
          mediaType={lastMessageMediaType ?? null}
          whatsappStatus={lastMessageStatus ?? null}
        />
        {/* Linha única de meta: status · atenção · responsável */}
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status.dotColor)} />
          <span className={cn('text-[10px] font-medium shrink-0', status.color)}>
            {locale === 'pt-BR' ? status.label : status.labelEn}
          </span>
          {value.needs_human_attention && (
            <>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">·</span>
              <span className="inline-flex items-center gap-1 shrink-0 text-destructive">
                <WarningCircle className="h-3 w-3" />
                <span className="text-[10px] font-medium">Atenção</span>
              </span>
            </>
          )}
          {value.assigned_user_name && (
            <>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">·</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {value.assigned_user_name}
              </span>
            </>
          )}
        </div>

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
  // Endpoint EFETIVO de envio: se o primary da thread está desconectado, resolve
  // o número ativo da linha (messaging_lines) — igual ao dispatcher (Fase 0).
  // Usado para escopar composer + seletor de templates no número que de fato envia.
  const sendEp = useThreadSendEndpoint(selectedThreadId);
  const effectiveWaProvider = (sendEp.isRotated && sendEp.provider)
    ? sendEp.provider
    : selectedThreadWaProvider;
  const [textareaOverflow, setTextareaOverflow] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Janela de atendimento (24h/CTWA 72h) — hoisted for use nos handlers e UI.
  // Substitui o antigo state `isIn24hWindow` + `hoursDiff<24` local.
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
  // Sessão de "Vincular como documento": páginas (mídias) + modo de seleção na conversa.
  const [attach, setAttach] = useState<{ pages: AttachMedia[] } | null>(null);
  const [attachPicking, setAttachPicking] = useState(false);
  const mediaToAttach = (m: any): AttachMedia => ({
    url: m.media_urls[0] as string,
    mediaType: m.media_type,
    fileName: null,
    label: `${m.media_type === 'image' ? 'Imagem' : 'Documento'} · ${new Date(m.sent_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`,
  });
  
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

  // Deep-link: ?thread=<id> abre uma thread específica (usado pela aba
  // Conversas do contato). Fluxo:
  //   1. Hidrata a thread via loadThreadForSelection e injeta como
  //      selectedThreadOverride (mesmo caminho do "Nova Conversa"),
  //      garantindo que apareça na lista mesmo fora da página atual.
  //   2. Seta selectedThreadId — o useEffect abaixo dispara fetchMessages.
  //   3. Dispara fetchMessages explicitamente também, para blindar contra
  //      qualquer race em que o efeito com dep [selectedThreadId] não
  //      re-fire (por já ter sido setado antes do handler concluir).
  //   4. NÃO removemos o ?thread= da URL para evitar re-render/race que
  //      antes causava painel vazio no primeiro carregamento.
  const [searchParams] = useSearchParams();
  const deepLinkThreadId = searchParams.get('thread');
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkThreadId || !organization?.id) return;
    if (deepLinkHandledRef.current === deepLinkThreadId) return;
    deepLinkHandledRef.current = deepLinkThreadId;
    (async () => {
      const loaded = await loadThreadForSelection(deepLinkThreadId, null);
      if (loaded) setSelectedThreadOverride(loaded);
      setSelectedThreadId(deepLinkThreadId);
      // Explicit fetch — se o useEffect [selectedThreadId] já rodou com
      // o mesmo id (ex.: usuário navega para o mesmo link duas vezes),
      // ele não re-fire; garantimos aqui.
      fetchMessages(deepLinkThreadId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkThreadId, organization?.id]);



  
  // Note mode state
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [inlineNotes, setInlineNotes] = useState<InlineNote[]>([]);
  /** Marcos históricos do CRM exibidos na timeline (somente leitura). */
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  /** Expansão de containers encerrados, por blockKey (nunca persistido). */

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Opportunities for current contact (mark as won/lost from chat)
  type ChatOpp = { id: string; title: string; pipeline_stage_id: string; close_date: string | null; contact_id: string | null };
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
  const { threads, loading: threadsLoading, error: threadsError, refetchThreads, loadMore, hasMore, loadingMore, markThreadRead } = useMessageThreads({ channels: ['whatsapp'], search: debouncedSearch });

  const selectedThread = threads?.find((t) => t.id === selectedThreadId)
    ?? (selectedThreadOverride?.id === selectedThreadId ? selectedThreadOverride : undefined);

  // Multi-number support (temporary CT transition period).
  // Only renders selector + per-thread badge when the org has 2+ active endpoints.
  const { endpoints: orgEndpoints, officialNumbers, hasMultiple: hasMultipleEndpoints } = useOrgWhatsAppEndpoints(organization?.id);
  const threadIdsForEndpointMap = (threads ?? []).map((t) => t.id);
  const threadEndpointMap = useThreadEndpointMap(threadIdsForEndpointMap, hasMultipleEndpoints);
  // Badge da lista lateral (somente exibição): endpoint da última mensagem,
  // com `primary_endpoint_id` como fallback.
  const threadBadgeEndpoints = useThreadBadgeEndpoints(threadIdsForEndpointMap, hasMultipleEndpoints);
  // Preview da última mensagem (somente exibição): resolve media_type/whatsapp_status
  // em lote pelos `last_message_id` das threads carregadas.
  const lastMessageMeta = useThreadLastMessageMeta(
    (threads ?? []).map((t) => t.last_message_id),
    true,
  );
  const endpointById: Record<string, typeof orgEndpoints[number]> = Object.fromEntries(orgEndpoints.map((e) => [e.id, e]));

  // PR4: business_context da thread selecionada. Quando 'sales', o composer
  // deve preferir endpoint com purpose ∈ SALES_PURPOSES (comercial). Ex.:
  // thread histórica do 7027 pré-16/06 aparece como sales em /messages e
  // enviaremos pelo 7020 (comercial), não pelo 7027 (customer_service).
  // PR5.3 pré-req: /messages já filtra business_context='sales' na RPC de
  // listagem. Enquanto o hook async está loading (ou retorna null para threads
  // legadas sem coluna preenchida), assumimos 'sales' como fallback determinístico.
  // Isso elimina a race em que um send rápido (template/texto/mídia) sairia sem
  // businessContext no payload e cairia no path legado do primary_endpoint.
  const hookedThreadBusinessContext = useThreadBusinessContext(selectedThreadId);
  const selectedThreadBusinessContext: ThreadBusinessContext =
    hookedThreadBusinessContext ?? 'sales';

  // ---------------------------------------------------------------------------
  // Fase 2.5 — Route Comercial da thread selecionada (SOMENTE LEITURA).
  // Reusa o resolver V2 do cliente; nenhum backend foi alterado.
  // ---------------------------------------------------------------------------
  const { route: salesRoute, isLoading: salesRouteLoading } = useSalesRoute({
    threadId: selectedThreadId,
    organizationId: organization?.id,
    businessContext: selectedThreadBusinessContext,
    channel: 'whatsapp',
  });
  // Histórico de endpoints e status do resolver vivem no painel/modal de detalhes.

  // Mesma derivação de `useSalesRouteView`: apenas REPLY_ROUTE_UNRESOLVED conta
  // como conversa legada. Carregando / flag off / fora de escopo = indeterminado.
  const salesRouteEndpointState: EndpointState = salesRoute.resolved
    ? salesRoute.activeEndpoint?.is_active === true ? 'online' : 'offline'
    : !salesRouteLoading && salesRoute.reason === 'REPLY_ROUTE_UNRESOLVED'
      ? 'unresolved'
      : 'unknown';
  // ---------------------------------------------------------------------------
  // Switch "Responder por" (Comercial). Feature `sales_manual_reply_endpoint_v1`
  // OFF ⇒ nenhuma query extra, nenhuma UI, comportamento atual intacto.
  // ---------------------------------------------------------------------------
  const manualReply = useManualReplyEndpoint({
    organizationId: organization?.id,
    threadId: selectedThreadId,
    userId: userProfile?.id,
    businessContext: selectedThreadBusinessContext,
    channel: 'whatsapp',
    // Usado SOMENTE quando a conversa não tem nenhuma mensagem roteável.
    routeDefaultEndpointId: salesRoute.activeEndpoint?.id ?? null,
  });
  const replyEndpointSelection = manualReply.replyEndpointSelection;
  // O seletor "Responder por" reflete a última mensagem válida da conversa:
  // após qualquer envio, essa leitura precisa ser revalidada.
  const invalidateThreadLastEndpoint = useInvalidateThreadLastEndpoint();

  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
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
    // O endpoint efetivo de envio é resolvido pelo dispatcher a partir da
    // linha ativa do purpose (`messaging_lines.active_endpoint_id`). Aqui
    // apenas escolhemos o *default visual* do composer:
    //  - `sendEp.endpointId` quando resolvido (reflete a linha ativa);
    //  - senão, fallback pro primary da thread ou o primeiro ativo da org.
    return sendEp.endpointId ?? selectedThreadPrimaryEndpointId ?? orgEndpoints[0]?.id ?? null;
  })();

  const composerEndpointId = selectedThreadId
    ? composerEndpointByThread[selectedThreadId]
        ?? (sendEp.isRotated ? sendEp.endpointId : null)
        ?? defaultComposerEndpointId
    : null;
  const setComposerEndpointId = (id: string) => {
    if (!selectedThreadId) return;
    setComposerEndpointByThread((prev) => ({ ...prev, [selectedThreadId]: id }));
  };
  // Capacidade declarada do endpoint efetivo — única fonte de verdade para
  // decidir se o composer libera texto livre fora da janela 24h. NÃO
  // participa da *escolha* do endpoint (isso é responsabilidade da linha
  // ativa via `useThreadSendEndpoint`); apenas informa se aquele endpoint
  // exige template.
  const composerEndpoint = composerEndpointId ? endpointById[composerEndpointId] : null;
  const composerAllowsFreeformOutsideWindow =
    sendEp.requiresTemplateOutsideWindow === false;
  const selectedEndpointFallback = selectedEndpointDetails?.threadId === selectedThreadId
    ? selectedEndpointDetails.endpoint
    : null;
  const selectedThreadEndpoint = selectedThreadPrimaryEndpointId
    ? endpointById[selectedThreadPrimaryEndpointId] ?? selectedEndpointFallback ?? undefined
    : selectedEndpointFallback ?? undefined;
  const selectedEndpointIdentity = formatEndpointIdentity(selectedThreadEndpoint);

  // Números dos endpoints usados nas mensagens (inclui inativos) — para o
  // cabeçalho do container quando a conversa passou por mais de um número.

  const messageEndpointIds = useMemo(
    () => Array.from(new Set(messages.map((m: any) => m.endpoint_id).filter(Boolean))) as string[],
    [messages],
  );
  const endpointNumbers = useEndpointNumbers(messageEndpointIds);

  // Compliance: janela de atendimento unificada (24h clássica + CTWA 72h).
  // Fonte da verdade: `getServiceWindow` via `useServiceWindow`. Substitui a
  // lógica antiga `isIn24hWindow = hoursDiff < 24` que ignorava CTWA.
  const composerLastInboundAt = (() => {
    const t = getLastInboundTime(selectedThread as any, messages);
    return t ? t.toISOString() : null;
  })();
  const serviceWindow = useServiceWindow({
    contactId: selectedThread?.contact_id ?? null,
    lastInboundAt: composerLastInboundAt,
  });

  // ---- Snippets internos (mensagens pré-prontas, freeform) --------------
  // Só aparecem quando a janela WhatsApp está aberta. Filtrados pelo
  // `purpose` do endpoint atual do composer (commercial | customer_service).
  const composerEndpointPurpose = composerEndpointId
    ? endpointById[composerEndpointId]?.purpose ?? null
    : null;
  const { snippets } = useSnippets({
    organizationId: serviceWindow.isOpen ? organization?.id : null,
    purpose: composerEndpointPurpose,
  });
  const [snippetPickerOpen, setSnippetPickerOpen] = useState(false);
  const [snippetShortcutQuery, setSnippetShortcutQuery] = useState<string | undefined>(undefined);
  const pendingSnippetIdRef = useRef<string | null>(null);
  const lowEndpointWindowBlocked = isLowEndpointWindowBlocked(composerEndpointId, serviceWindow.isOpen);

  // Derived numbers for interpolation (numero_comercial / numero_atendimento).
  const commercialEndpointNumber = useMemo(() => {
    const ep = orgEndpoints.find((e) => isSalesPurpose(e.purpose ?? null));
    return ep?.external_address ?? '';
  }, [orgEndpoints]);
  const serviceEndpointNumber = useMemo(() => {
    const ep = orgEndpoints.find((e) => (e.purpose ?? null) === 'customer_service');
    return ep?.external_address ?? '';
  }, [orgEndpoints]);

  const applySnippet = (snippet: MessageSnippet) => {
    const body = interpolateSnippet(snippet.body, buildSnippetVars({
      contactName: selectedThread?.contact_name ?? null,
      companyName: (selectedThread as any)?.company_name ?? null,
      agentName: userProfile?.full_name ?? null,
      commercialNumber: commercialEndpointNumber,
      serviceNumber: serviceEndpointNumber,
    }));
    setMessageText(body);
    pendingSnippetIdRef.current = snippet.id;
    // devolver foco ao textarea
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(body.length, body.length);
        adjustTextareaHeight();
      }
    }, 0);
  };




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
        .select('id, title, pipeline_stage_id, close_date, contact_id')
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
      const result = await transitionOpportunityStage({
        organizationId: organization.id,
        opportunityId: opp.id,
        targetStageId: targetStage.id,
        closeDate,
        source: 'inbox',
      });
      if (!result.ok) throw new Error(result.error || 'closing_requirements_missing');
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
      invalidateThreadLastEndpoint(selectedThreadId);
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
          invalidateThreadLastEndpoint(newMessage.thread_id);
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
          invalidateThreadLastEndpoint(updatedMessage.thread_id);
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
  }, [organization?.id, selectedThreadId, invalidateThreadLastEndpoint]);

  // (removido) Timer 60s de `isIn24hWindow` — agora `useServiceWindow`
  // recalcula sozinho e cobre janela CTWA 72h além da sessão 24h.


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
          sender_type, sender_name, sender_agent_id, sender_user_id, metadata, endpoint_id,
          reply_to_message:reply_to_message_id (content, direction)
        `)
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      invalidateThreadLastEndpoint(selectedThreadId);
      setMessages((data as Message[]) || []);

      // Fetch inline notes from activities for this contact
      const thread = threads?.find((t) => t.id === threadId)
        ?? (selectedThreadOverride?.id === threadId ? selectedThreadOverride : undefined);
      if (thread?.contact_id && organization?.id) {
        const { data: notesData } = await supabase
          .from('activities')
          .select('id, title, body, occurred_at, created_by_user_id, users:created_by_user_id(full_name)')
          .eq('organization_id', organization.id)
          .eq('contact_id', thread.contact_id)
          .eq('activity_type', 'note')
          .is('deleted_at', null)
          .order('occurred_at', { ascending: true });

        setInlineNotes(
          (notesData || []).map((n: any) => ({
            id: n.id,
            title: n.title ?? null,
            body: n.body,
            occurred_at: n.occurred_at,
            created_by_user_id: n.created_by_user_id,
            author_name: n.users?.full_name || null,
          }))
        );

      } else {
        setInlineNotes([]);
      }

      // Marcos históricos do CRM (somente leitura, escopo da thread).
      // Puramente apresentacional: não altera mensagens, envio ou realtime.
      try {
        const events: TimelineEvent[] = [];
        if (thread?.created_at) {
          events.push({
            id: `created-${threadId}`,
            occurred_at: thread.created_at,
            label: locale === 'pt-BR' ? 'Conversa criada' : 'Conversation created',
          });
        }
        const { data: assignments } = await supabase
          .from('thread_assignment_history')
          .select('id, action_type, from_user_id, to_user_id, performed_by_user_id, created_at, from_user:from_user_id(full_name), to_user:to_user_id(full_name), performed_by:performed_by_user_id(full_name)')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });

        for (const row of (assignments || []) as any[]) {
          const fromName = row.from_user?.full_name ?? null;
          const toName = row.to_user?.full_name ?? null;
          const byName = row.performed_by?.full_name ?? null;
          let label: string;
          let value: string | null = null;
          switch (row.action_type) {
            case 'take_over':
              label = 'Atendimento assumido';
              value = byName ?? toName;
              break;
            case 'auto_reassign':
              label = 'Atendente alterado automaticamente';
              value = `${fromName ?? '—'} → ${toName ?? '—'}`;
              break;
            case 'reopen':
              label = 'Atendimento reaberto';
              value = byName;
              break;
            case 'manual_assignment':
            default:
              label = fromName ? 'Atendente alterado' : 'Atendente definido';
              value = fromName ? `${fromName} → ${toName ?? '—'}` : toName ?? '—';
              break;
          }
          events.push({
            id: `assign-${row.id}`,
            occurred_at: row.created_at,
            label,
            value,
          });
        }
        setTimelineEvents(events);
      } catch (eventsError) {
        console.error('Error fetching timeline events:', eventsError);
        setTimelineEvents([]);
      }



      // (removido) recomputo local de 24h; `useServiceWindow` cuida disso.


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
      invalidateThreadLastEndpoint(selectedThreadId);
    } catch (err: any) {
      setInlineNotes((prev) => prev.filter((n) => n.id !== tempId));
      toast({ variant: 'destructive', description: 'Erro ao salvar nota' });
    }
  };

  // Fase 2 — números pessoais: o composer é bloqueado quando o endpoint
  // selecionado (manual ou derivado) não é permitido ao usuário atual. A troca
  // de número é sempre explícita; o backend revalida no envio.
  const replyEndpointBlocked = manualReply.composerBlocked;
  const guardReplyEndpointAllowed = () => {
    if (!replyEndpointBlocked) return true;
    toast({
      variant: 'destructive',
      description:
        manualReply.composerBlockReason === 'none_allowed'
          ? 'Nenhum número permitido para responder nesta conversa.'
          : 'Escolha um número permitido para responder.',
    });
    return false;
  };

  const handleSendMessage = async () => {
    if (isNoteMode) {
      handleSendNote();
      return;
    }
    if (!guardReplyEndpointAllowed()) return;
    if (!organization?.id || !messageText.trim() || !selectedThread) return;

    // Gate janela 24h: bloqueia envio livre APENAS quando o endpoint efetivo
    // exige template fora da janela (capacidade declarada em
    // `communication_endpoints.requires_template_outside_window`). Endpoints
    // que declaram `false` (ex.: Evolution) permitem envio livre sempre —
    // sem migração explícita, o dispatcher já roteia pela linha ativa.
    if (
      !serviceWindow.isOpen &&
      !composerAllowsFreeformOutsideWindow &&
      messages.length > 0
    ) {
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
      // TEMP QA PR5.3: instrumentação para validar race condition fix
      console.info('[composer-send]', {
        threadId: selectedThreadId,
        businessContext: selectedThreadBusinessContext,
        endpointId: composerEndpointId,
        senderContext: 'messages',
        kind: 'text',
      });
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
          ...(replyEndpointSelection ? { replyEndpointSelection } : {}),
        });

      if (error) throw error;
      invalidateThreadLastEndpoint(selectedThreadId);

      if (data.error) {
        if (data.requiresTemplate) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setMessageText(savedText);
          setShowTemplates(true);
          toast({ description: data.message || 'Fora da janela WhatsApp. Selecione um template aprovado.' });
          return;
        }
        throw new Error(data.message || data.error);
      }

      if (replyEndpointSelection?.source === 'manual') void manualReply.useDerived();
      refetchThreads();

      // Auditoria de snippet: grava metadata.snippet_id + incrementa usage_count.
      const snippetId = pendingSnippetIdRef.current;
      const sentMessageId = (data as any)?.messageId as string | undefined;
      pendingSnippetIdRef.current = null;
      if (snippetId && sentMessageId) {
        (async () => {
          try {
            const { data: existing } = await supabase
              .from('messages')
              .select('metadata')
              .eq('id', sentMessageId)
              .maybeSingle();
            const nextMeta = { ...((existing as any)?.metadata ?? {}), snippet_id: snippetId };
            await supabase.from('messages').update({ metadata: nextMeta }).eq('id', sentMessageId);
          } catch (e) {
            console.warn('[snippet-audit] metadata update failed', (e as Error).message);
          }
          bumpSnippetUsage(snippetId);
        })();
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const msg = toErrorMessageString(error, 'Erro ao enviar mensagem');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: msg }
            : m
        )
      );
      toast({ variant: 'destructive', description: msg });
    }
  };

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!organization?.id || !selectedThread) return;

    // Guard: template bloqueado por endpoint (regra LOW hardcoded — 7020).
    const endpointBlock = assertTemplateAllowedForEndpoint(templateId, composerEndpointId);
    if (endpointBlock) {
      logComplianceBlock({
        organizationId: organization.id,
        blockReason: 'template_blocked_7020_policy',
        endpointId: composerEndpointId,
        threadId: selectedThreadId,
        contactId: selectedThread.contact_id,
        templateId,
        attemptedByUserId: userProfile?.id ?? null,
        sourceComponent: 'messages_list',
        window: serviceWindow,
      });
      toast({ variant: 'destructive', description: endpointBlock });
      return;
    }
    // Guard: rate limit 1 template / thread / 24h.
    if (selectedThreadId) {
      const rate = await checkTemplateRateLimit(selectedThreadId, organization.id);
      if (!rate.allowed) {
        logComplianceBlock({
          organizationId: organization.id,
          blockReason: 'template_blocked_rate_limit',
          endpointId: composerEndpointId,
          threadId: selectedThreadId,
          contactId: selectedThread.contact_id,
          templateId,
          attemptedByUserId: userProfile?.id ?? null,
          sourceComponent: 'messages_list',
          window: serviceWindow,
          extra: { last_template_sent_at: rate.lastSentAt },
        });
        toast({ variant: 'destructive', description: rate.reason ?? 'Rate limit atingido.' });
        return;
      }
    }

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
      // TEMP QA PR5.3: instrumentação para validar race condition fix
      console.info('[composer-send]', {
        threadId: selectedThreadId,
        businessContext: selectedThreadBusinessContext,
        endpointId: composerEndpointId,
        senderContext: 'messages',
        kind: 'template',
        templateId,
      });
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
          ...(replyEndpointSelection ? { replyEndpointSelection } : {}),
        });

      if (error) throw error;
      invalidateThreadLastEndpoint(selectedThreadId);

      if (data.error) {
        throw new Error(data.error);
      }

      if (replyEndpointSelection?.source === 'manual') void manualReply.useDerived();
      refetchThreads();
    } catch (error: any) {
      console.error('Error sending template:', error);
      const msg = toErrorMessageString(error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: msg }
            : m
        )
      );
      toast({ variant: 'destructive', description: msg });
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

  const handleMediaUpload = async (
    file: File,
    caption: string | null = null,
    opts?: { forceMediaType?: 'document' | 'image' | 'audio' | 'video' },
  ) => {
    if (!organization?.id || !selectedThread) return;
    if (!guardReplyEndpointAllowed()) return;

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
    if (opts?.forceMediaType) mediaType = opts.forceMediaType;


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

      // TEMP QA PR5.3: instrumentação para validar race condition fix
      console.info('[composer-send]', {
        threadId: selectedThreadId,
        businessContext: selectedThreadBusinessContext,
        endpointId: composerEndpointId,
        senderContext: 'messages',
        kind: 'media',
        mediaType,
      });
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
          ...(replyEndpointSelection ? { replyEndpointSelection } : {}),
        });

      if (error) throw error;
      invalidateThreadLastEndpoint(selectedThreadId);
      if (replyEndpointSelection?.source === 'manual') void manualReply.useDerived();
      refetchThreads();
    } catch (error: any) {
      console.error('Error uploading media:', error);
      const msg = toErrorMessageString(error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, whatsapp_status: 'failed', error_message: msg }
            : m
        )
      );
      toast({ variant: 'destructive', description: msg });
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
      toast({ variant: 'destructive', description: toErrorMessageString(error) });
    }
  };

  const handleAudioSendAsDocument = async (audioBlob: Blob) => {
    if (!organization?.id || !selectedThread) return;
    try {
      const audioFile = audioBlobToFile(audioBlob, `gravacao-${Date.now()}`);
      // Force upload+send as document (bypasses audio classification).
      await handleMediaUpload(audioFile, null, { forceMediaType: 'document' });
    } catch (error: any) {
      console.error('Error sending audio as document:', error);
      toast({ variant: 'destructive', description: toErrorMessageString(error) });
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
  // Fase 2.5 — threads já consolidadas (merged) não aparecem no Comercial.
  // A query/RPC de listagem permanece intacta: aqui apenas ocultamos da exibição.
  const consolidatedThreadIds = useConsolidatedThreadIds(
    (filteredThreads ?? []).map((t) => t.id),
  );
  const visibleThreads = filteredThreads
    ?.filter((t) => !consolidatedThreadIds.has(t.id))
    .filter((t) => !isHidden(t.id, t.last_inbound_at || t.whatsapp_last_inbound_at))
    .filter((t) => endpointFilter === 'all' || threadEndpointMap[t.id] === endpointFilter);

  const visibleThreadsWithSelectedRaw = selectedThreadOverride
    && selectedThreadId === selectedThreadOverride.id
    && !(visibleThreads ?? []).some((t) => t.id === selectedThreadOverride.id)
      ? [selectedThreadOverride, ...(visibleThreads ?? [])]
      : visibleThreads;
  // Dedupe by id (first occurrence wins). Duplicate keys corrupt react-aria
  // ListBox's collection keymap and surface as `RangeError: Invalid array length`.
  const visibleThreadsWithSelected = visibleThreadsWithSelectedRaw
    ? (() => {
        const seen = new Set<string>();
        const out: typeof visibleThreadsWithSelectedRaw = [];
        for (const t of visibleThreadsWithSelectedRaw) {
          if (!t?.id || seen.has(t.id)) continue;
          seen.add(t.id);
          out.push(t);
        }
        return out;
      })()
    : visibleThreadsWithSelectedRaw;

  // Fase Final — vazio contextual da lista: distingue "sem conversas" de
  // "busca/filtro sem resultado". Não altera nenhuma query.
  const hasActiveListFilters =
    searchQuery.trim().length > 0 || endpointFilter !== 'all' || (filter !== null && filter !== 'all_open');
  const clearListFilters = () => {
    setSearchQuery('');
    setEndpointFilter('all');
    setFilter('all_open');
  };

  const loadThreadForSelection = async (
    threadId: string,
    fallbackEndpointId: string | null,
  ): Promise<(ChatThread & { primary_endpoint_id?: string | null }) | null> => {
    if (!organization?.id) return null;

    const { data: row, error } = await supabase
      .from('message_threads')
      .select('id, contact_id, status, updated_at, created_at, last_message_at, whatsapp_last_inbound_at, last_inbound_at, needs_human_attention, assigned_user_id, primary_endpoint_id, last_message_id, last_message_content, last_message_direction')
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
      last_message_id: (row as any).last_message_id ?? null,
      last_message_direction: (row as any).last_message_direction ?? null,
      updated_at: (row as any).updated_at,
      last_message_at: (row as any).last_message_at ?? null,
      created_at: (row as any).created_at,
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
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
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
              ) : threadsError ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <Warning size={20} className="text-amber-500" weight="bold" />
                  <p className="text-sm text-foreground">
                    {locale === 'pt-BR' ? 'Não foi possível carregar as conversas.' : 'Could not load conversations.'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetchThreads()}>
                    {locale === 'pt-BR' ? 'Tentar novamente' : 'Try again'}
                  </Button>
                </div>
              ) : visibleThreadsWithSelected?.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {hasActiveListFilters
                      ? (locale === 'pt-BR' ? 'Nenhuma conversa encontrada.' : 'No conversations found.')
                      : (locale === 'pt-BR' ? 'Nenhuma conversa.' : 'No conversations.')}
                  </p>
                  {hasActiveListFilters && (
                    <Button variant="outline" size="sm" onClick={clearListFilters}>
                      {locale === 'pt-BR' ? 'Limpar filtros' : 'Clear filters'}
                    </Button>
                  )}
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
                        /* Badge visual: última mensagem -> primary_endpoint_id.
                           Resolvido em `useThreadBadgeEndpoints`, que lê
                           `communication_endpoints` sem filtro por provider
                           (Evolution não tem sender_sid/status). */
                        endpointAddress={threadBadgeEndpoints[thread.id]?.address ?? null}
                        endpointPurpose={null}
                        endpointProvider={threadBadgeEndpoints[thread.id]?.provider ?? null}
                        endpointIsActive={threadBadgeEndpoints[thread.id]?.isActive ?? null}
                        officialNumbers={officialNumbers}
                        lastMessageMediaType={thread.last_message_id ? lastMessageMeta[thread.last_message_id]?.mediaType ?? null : null}
                        lastMessageStatus={thread.last_message_id ? lastMessageMeta[thread.last_message_id]?.whatsappStatus ?? null : null}
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
                {/* Chat Header — Fase Final: componente único (SalesConversationHeader) */}
                <SalesConversationHeader
                  threadId={selectedThread.id}
                  organizationId={organization?.id}
                  businessContext={selectedThreadBusinessContext}
                  channel="whatsapp"
                  contactId={selectedThread.contact_id}
                  contactName={selectedThread.contact_name}
                  contactPhone={selectedThread.contact_phone}
                  contactProfileTitle={locale === 'pt-BR' ? 'Ver perfil do contato' : 'View contact profile'}
                  assigneeName={selectedThread.assigned_user_name ?? null}
                  statusLabel={
                    selectedThread.status && statusConfig[selectedThread.status]
                      ? (locale === 'pt-BR' ? statusConfig[selectedThread.status].label : statusConfig[selectedThread.status].labelEn)
                      : null
                  }
                  statusClassName={
                    selectedThread.status && statusConfig[selectedThread.status]
                      ? statusConfig[selectedThread.status].color
                      : undefined
                  }
                  fallbackAddress={selectedThreadEndpoint?.external_address ?? null}
                  fallbackProvider={selectedThreadEndpoint?.provider ?? null}
                  detailsLabel={locale === 'pt-BR' ? 'Detalhes da rota' : 'Route details'}
                  onOpenDetails={() => setRouteDetailsOpen(true)}
                  windowChips={
                    <WhatsAppWindowChip
                      channel="whatsapp"
                      lastInboundAt={composerLastInboundAt}
                      contactId={selectedThread.contact_id}
                      tone="soft"
                    />
                  }
                  actions={
                    <>


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
                    </>
                  }
                />

                {/* Modal técnico da rota — lazy mount: só monta (e consulta) quando aberto */}
                {routeDetailsOpen && (
                  <SalesRouteDetailsDialog
                    open
                    onOpenChange={setRouteDetailsOpen}
                    threadId={selectedThread.id}
                    organizationId={organization?.id}
                    businessContext={selectedThreadBusinessContext}
                    channel="whatsapp"
                    contactName={selectedThread.contact_name}
                    contactPhone={selectedThread.contact_phone}
                    assigneeName={selectedThread.assigned_user_name ?? null}
                    statusLabel={
                      selectedThread.status && statusConfig[selectedThread.status]
                        ? (locale === 'pt-BR' ? statusConfig[selectedThread.status].label : statusConfig[selectedThread.status].labelEn)
                        : null
                    }
                  />
                )}


                {/* Messages Area */}
                <LowQualityEndpointBanner endpointId={composerEndpointId} />
                {showTemplates ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <WhatsAppTemplateSelector
                      onSelect={handleSendTemplate}
                      onCancel={() => setShowTemplates(false)}
                      endpointId={composerEndpointId}
                      windowIsOpen={serviceWindow.isOpen}
                      provider={resolveComposerProvider({
                        organizationId: organization?.id,
                        senderContext: 'messages',
                        resolvedProvider: (effectiveWaProvider === 'twilio' || effectiveWaProvider === 'meta_cloud_api') ? effectiveWaProvider : null,
                        businessContext: selectedThreadBusinessContext,
                        threadPrimaryPurpose: sendEp.isRotated ? sendEp.purpose : primaryEndpointPurpose,
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
                          {/* Timeline única: mensagens, notas e marcos do CRM */}
                          {(() => {
                            const itemDateOf = (i: ChatItem) =>
                              i._type === 'message' ? i.data.sent_at : i.data.occurred_at;
                            const chatItems: ChatItem[] = [
                              ...messages.map((m) => ({ _type: 'message' as const, data: m })),
                              ...inlineNotes.map((n) => ({ _type: 'note' as const, data: n })),
                              ...timelineEvents.map((e) => ({ _type: 'event' as const, data: e })),
                            ].sort((a, b) => {
                              return new Date(itemDateOf(a)).getTime() - new Date(itemDateOf(b)).getTime();
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

                            // Pré-passe puramente visual: descreve cada item da
                            // timeline para o agrupamento (estilo Kommo). Não
                            // altera ordenação, dados nem paginação.
                            const { blockFlags, groupFlags, descriptors } = (() => {
                              let prevDateKey: string | null = null;
                              let prevEndpoint: string | null = null;
                              const descriptors: GroupingItem[] = chatItems.map((item) => {
                                const iso = itemDateOf(item);
                                const dateKey = new Date(iso).toDateString();
                                const dateBreak = dateKey !== prevDateKey;
                                prevDateKey = dateKey;

                                if (item._type === 'note') {
                                  return {
                                    kind: 'note' as const,
                                    direction: 'internal',
                                    senderType: null,
                                    senderId: item.data.created_by_user_id ?? null,
                                    timestamp: new Date(iso).getTime(),
                                    dateBreak,
                                  };
                                }

                                if (item._type === 'event') {
                                  return {
                                    kind: 'event' as const,
                                    direction: null,
                                    senderType: null,
                                    senderId: null,
                                    timestamp: new Date(iso).getTime(),
                                    dateBreak,
                                  };
                                }

                                const m = item.data;

                                const metaKind = m.metadata && typeof m.metadata === 'object' ? (m.metadata as any).kind : null;
                                const isSystem =
                                  m.sender_type === 'system' ||
                                  metaKind === 'endpoint_migration_meta_7020' ||
                                  metaKind === 'endpoint_provider_migration';

                                const epId = (m as any).endpoint_id ?? null;
                                let endpointBreak = false;
                                if (epId && prevEndpoint && epId !== prevEndpoint) {
                                  const fromAddr = endpointNumbers[prevEndpoint]?.address ?? null;
                                  const toAddr = endpointNumbers[epId]?.address ?? null;
                                  endpointBreak = Boolean(fromAddr && toAddr && fromAddr !== toAddr);
                                }
                                if (epId) prevEndpoint = epId;

                                return {
                                  kind: isSystem ? ('system' as const) : ('message' as const),
                                  direction: m.direction ?? null,
                                  senderType: m.sender_type ?? null,
                                  senderId: m.sender_agent_id ?? m.sender_user_id ?? null,
                                  timestamp: new Date(m.sent_at).getTime(),
                                  failed: m.whatsapp_status === 'failed',
                                  isReply: Boolean(m.reply_to_message_id),
                                  dateBreak,
                                  endpointBreak,
                                  endpointId: epId,
                                  provider: epId ? endpointNumbers[epId]?.provider ?? null : null,
                                };
                              });
                              const blockFlags = computeContextBlocks(descriptors);
                              // Agrupamento interno de bolhas restrito ao bloco.
                              const withBlocks = descriptors.map((d, i) => ({
                                ...d,
                                blockIndex: blockFlags[i].blockIndex,
                              }));
                              return { blockFlags, groupFlags: computeMessageGroups(withBlocks), descriptors };
                            })();

                            let lastDateKey: string | null = null;
                            // O cabeçalho é calculado para toda mensagem; a fase
                            // de segmentos decide onde ele é realmente exibido
                            // (apenas na criação de um container visual).



                            const renderedItems = chatItems.map((item, itemIndex) => {
                              const group = groupFlags[itemIndex] ?? { isGroupStart: true, isGroupEnd: true };
                              const isGroupStart = group.isGroupStart;
                              const isGroupEnd = group.isGroupEnd;
                              const block = blockFlags[itemIndex] ?? { isBlockStart: true, isBlockEnd: true, blockIndex: 0 };
                              const descriptor = descriptors[itemIndex];
                              const itemDate = itemDateOf(item);
                              const dateKey = new Date(itemDate).toDateString();
                              const showSeparator = dateKey !== lastDateKey;
                              lastDateKey = dateKey;


                              const separator = showSeparator ? (
                                <TimelineEventMarker
                                  key={`sep-${dateKey}`}
                                  label={formatDateSeparator(itemDate)}
                                  className="my-3"
                                />
                              ) : null;


                              // A troca de endpoint apenas quebra o container;
                              // o cabeçalho do container informa canal/provider/número.



                              // Cabeçalho do bloco de contexto (estilo Kommo):
                              // representa APENAS o canal/número do contexto.
                              // Puramente visual — nenhum dado novo é buscado.
                              let blockHeader: JSX.Element | null = null;
                              if (
                                item._type === 'message' &&
                                descriptor?.kind === 'message'
                              ) {


                                const epId = descriptor.endpointId ?? null;
                                const epAddress = epId ? endpointNumbers[epId]?.address ?? null : null;
                                const epProvider = epId ? endpointNumbers[epId]?.provider ?? null : null;
                                const providerShort = whatsappProviderShortLabel(epProvider);
                                const channelLine =
                                  providerShort && epProvider !== 'meta_cloud_api'
                                    ? `WhatsApp • ${providerShort}`
                                    : 'WhatsApp';
                                blockHeader = (
                                  <div className="pb-0">
                                    <div className="flex items-center justify-center gap-1.5 text-[11px] leading-4">
                                      <span className="font-medium text-foreground">{channelLine}</span>
                                      {epAddress && (
                                        <>
                                          <span className="text-muted-foreground/50">•</span>
                                          <span className="font-data text-muted-foreground">
                                            {formatPhoneDisplay(epAddress)}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    <div className="h-px bg-border/70 mt-1.5 mb-2" />
                                  </div>
                                );

                              }




                              const renderItem = (() => {
                              if (item._type === 'note') {
                                const note = item.data;
                                // Atividades de sistema (round-robin, automações) são
                                // classificadas pelo TIPO/título e viram separador discreto.
                                if (isSystemActivity(note.title)) {
                                  return (
                                    <TimelineEventMarker
                                      key={`sysnote-${note.id}`}
                                      label={note.body || note.title || 'Evento do sistema'}
                                      time={new Date(note.occurred_at).toLocaleTimeString(locale, {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: false,
                                      })}
                                    />
                                  );
                                }
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

                              if (item._type === 'event') {
                                const ev = item.data;
                                return (
                                  <TimelineEventMarker
                                    key={`event-${ev.id}`}
                                    label={ev.label}
                                    value={ev.value ?? null}
                                    time={new Date(ev.occurred_at).toLocaleTimeString(locale, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false,
                                    })}
                                  />
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
                                  <TimelineEventMarker
                                    key={`sys-${message.id}`}
                                    label={message.content}
                                    value={migrationAuditLine || null}
                                    className="my-2"
                                  />
                                );

                              }

                              const isOutbound = message.direction === 'outbound';

                              return (
                                <div
                                  key={message.id}
                                  className={cn(
                                    'flex items-end gap-2 group',
                                    isOutbound ? 'justify-end' : 'justify-start',
                                    // Agrupamento visual: mensagens continuadas
                                    // ficam colada à anterior (space-y-3 = 12px).
                                    !isGroupStart && '-mt-2.5'
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
                                        : 'bg-card border border-border text-foreground shadow-sm',
                                      // Bloco contínuo: reduz o raio no lado do remetente.
                                      isOutbound
                                        ? cn(!isGroupStart && 'rounded-tr-sm', !isGroupEnd && 'rounded-br-sm')
                                        : cn(!isGroupStart && 'rounded-tl-sm', !isGroupEnd && 'rounded-bl-sm')
                                    )}
                                  >
                                    {/* Feedback do agente — identidade fica no cabeçalho do bloco */}
                                    {isOutbound && message.sender_type === 'agent' && (
                                      <div className="flex items-center justify-end -mt-1 -mr-1">
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
                                          if (message.media_type === 'audio' || rawUrl.match(/\.(ogg|oga|opus|mp3|mpeg|wav|m4a|aac|amr|webm)(\?|$)/i)) {
                                             const isAudioOnly = message.media_type === 'audio';
                                             const timeStr = isGroupEnd
                                               ? new Date(message.sent_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
                                               : '';
                                             const audioTimestamp = timeStr;

                                             return <AudioMessagePlayer key={i} src={url}
                                               messageId={message.id}
                                               threadId={(message as any).thread_id}
                                               mediaType={message.media_type}
                                               timestamp={isAudioOnly && audioTimestamp ? audioTimestamp : undefined}
                                               statusIcon={isAudioOnly && isOutbound && isGroupEnd ? renderStatusIcon(message) : undefined}
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
                                        {/* Triagem inline: vincular mídia recebida como documento (imagem/PDF) */}
                                        {!isOutbound && isAttachableMedia(message.media_type) && message.media_urls[0] && (() => {
                                          const thisUrl = message.media_urls![0];
                                          const already = attach?.pages.some((p) => p.url === thisUrl);
                                          const linkedInfo = (message.metadata as any)?.attached_document;
                                          if (!attachPicking && linkedInfo) {
                                            return (
                                              <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600">
                                                <Check className="h-3.5 w-3.5" /> Vinculado{linkedInfo.type_name ? ` · ${linkedInfo.type_name}` : ''}
                                              </span>
                                            );
                                          }
                                          if (attachPicking) {
                                            return (
                                              <button
                                                type="button"
                                                onClick={() => { if (!already && attach) setAttach({ pages: [...attach.pages, mediaToAttach(message)] }); setAttachPicking(false); }}
                                                className={`mt-1 flex items-center gap-1 text-xs font-medium ${already ? 'text-emerald-600' : 'text-primary hover:underline'}`}
                                              >
                                                {already ? <><Check className="h-3.5 w-3.5" /> Já adicionada</> : <><Plus className="h-3.5 w-3.5" /> Adicionar esta página</>}
                                              </button>
                                            );
                                          }
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => { setAttach({ pages: [mediaToAttach(message)] }); setAttachPicking(false); }}
                                              className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                            >
                                              <Paperclip className="h-3.5 w-3.5" /> Vincular como documento
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {/* Content - hide media placeholders */}
                                    {message.content && 
                                     !(message.media_urls && message.media_urls.length > 0 && 
                                       ['📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo', '📎 Media', '📷 Image', '🎵 Audio', '🎬 Video',
                                        '[Áudio]', '[Imagem]', '[Vídeo]', '[Documento]', '[Sticker]'].includes(message.content)) && (
                                      <MetaRichMessageContent
                                        metadata={message.metadata}
                                        content={message.content}
                                        isOutbound={message.direction === 'outbound'}
                                        fallback={(c) => (
                                          <p className="text-sm whitespace-pre-wrap break-all">{c}</p>
                                        )}
                                      />
                                    )}

                                    {/* Inline failure reason */}
                                    {message.whatsapp_status === 'failed' && (
                                      <MessageFailureInline errorCode={message.error_code} />
                                    )}

                                    {/* Footer — operador humano (quando houver), horário e status
                                        no fim do grupo (áudio-only renderiza dentro do player) */}
                                    {!(message.media_type === 'audio') && isGroupEnd && (() => {
                                      const humanSenderName =
                                        isOutbound &&
                                        message.sender_type === 'user' &&
                                        message.sender_user_id &&
                                        message.sender_name?.trim()
                                          ? message.sender_name.trim()
                                          : null;
                                      return (
                                        <div className="mt-1 flex items-center justify-end gap-1 min-w-0">
                                          <span className="text-[11px] leading-[14px] text-muted-foreground/70 truncate">
                                            {humanSenderName ? `${humanSenderName} · ` : ''}
                                            {new Date(message.sent_at).toLocaleTimeString(locale, {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              hour12: false,
                                            })}
                                          </span>
                                          {isOutbound && renderStatusIcon(message)}
                                        </div>
                                      );
                                    })()}


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

                              return {
                                key: item._type === 'message' ? `m-${item.data.id}` : `n-${item.data.id}`,
                                blockIndex: block.blockIndex,
                                // ÚNICA condição de corte do container visual.
                                endpointBreak: descriptor?.endpointBreak === true,
                                kind: (descriptor?.kind ?? 'message') as 'message' | 'note' | 'system',
                                direction: descriptor?.direction ?? null,
                                separator,
                                
                                blockHeader,
                                renderItem,
                              };

                            });

                            // Segunda fase (puramente visual): mensagens do mesmo
                            // bloco de contexto são envolvidas em um contêiner
                            // ("cartão"), enquanto separadores, eventos de sistema
                            // e notas internas ficam fora dos cartões.
                            type Segment =
                              | { type: 'loose'; key: string; nodes: JSX.Element[] }
                              | {
                                  type: 'block';
                                  key: string;
                                  blockIndex: number;
                                  hasInbound: boolean;
                                  hasOutbound: boolean;
                                  headerNodes: JSX.Element[];
                                  messageNodes: JSX.Element[];
                                };
                            const segments: Segment[] = [];
                            // Um container nasce APENAS na troca real de número
                            // (endpointBreak) ou quando ainda não há container.
                            // Separadores de data, notas, activities e eventos de
                            // sistema entram NELE como marcadores internos.
                            let currentBlock: Extract<Segment, { type: 'block' }> | null = null;
                            let visualBlockSeq = 0;
                            for (const r of renderedItems) {
                              if (currentBlock && r.endpointBreak) {
                                currentBlock = null;
                              }

                              if (r.separator) {
                                if (currentBlock) currentBlock.messageNodes.push(r.separator);
                                else segments.push({ type: 'loose', key: `loose-${r.key}`, nodes: [r.separator] });
                              }

                              const isInsideCard = r.kind === 'message';
                              if (!isInsideCard) {
                                if (currentBlock) currentBlock.messageNodes.push(r.renderItem);
                                else segments.push({ type: 'loose', key: `item-${r.key}`, nodes: [r.renderItem] });
                                continue;
                              }

                              const isInbound = r.direction === 'inbound';
                              if (currentBlock) {
                                currentBlock.messageNodes.push(r.renderItem);
                                currentBlock.hasInbound = currentBlock.hasInbound || isInbound;
                                currentBlock.hasOutbound = currentBlock.hasOutbound || !isInbound;
                                if (r.blockHeader && currentBlock.headerNodes.length === 0) {
                                  currentBlock.headerNodes.push(r.blockHeader);
                                }
                              } else {
                                const created: Extract<Segment, { type: 'block' }> = {
                                  type: 'block',
                                  key: `block-${visualBlockSeq}-${r.key}`,
                                  blockIndex: visualBlockSeq,
                                  hasInbound: isInbound,
                                  hasOutbound: !isInbound,
                                  headerNodes: r.blockHeader ? [r.blockHeader] : [],
                                  messageNodes: [r.renderItem],
                                };
                                visualBlockSeq += 1;
                                segments.push(created);
                                currentBlock = created;
                              }
                            }



                            // Colapso automático de containers encerrados: o último
                            // container (atual) permanece sempre expandido.
                            const blockSegments = segments.filter((s) => s.type === 'block');
                            const currentBlockKey =
                              blockSegments.length > 0
                                ? (blockSegments[blockSegments.length - 1] as Extract<Segment, { type: 'block' }>).key
                                : null;

                            return segments.map((segment) =>
                              segment.type === 'loose' ? (
                                <Fragment key={segment.key}>
                                  {segment.nodes.map((node, i) => (
                                    <Fragment key={i}>{node}</Fragment>
                                  ))}
                                </Fragment>
                              ) : (
                                <TimelineBlock
                                  key={segment.key}
                                  headerNodes={segment.headerNodes}
                                  messageNodes={segment.messageNodes}
                                  isCurrent={segment.key === currentBlockKey}
                                  locale={locale}
                                  className="w-full rounded-lg border border-border/80 bg-muted/85 shadow-sm px-3 py-2.5 mt-2.5"
                                />
                              )
                            );



                          })()}
                          <div ref={scrollRef} />
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="border-t border-border p-4 bg-card">
                      {(() => {
                        // Gate de janela é decidido pela capacidade declarada
                        // do endpoint efetivo (`requires_template_outside_window`).
                        // Nenhum override por provider aqui.
                        const composerBypassesWindow = composerAllowsFreeformOutsideWindow;
                        const outOfWindow =
                          !serviceWindow.isOpen && messages.length > 0 && !composerBypassesWindow;
                        const outOfWindowCopy = serviceWindow.reason || (locale === 'pt-BR' ? 'Fora da janela — selecione um template' : 'Outside window — select a template');
                        const showNoInboundHint =
                          !outOfWindow && composerBypassesWindow && !serviceWindow.isOpen && messages.length > 0;
                        return (
                          <>
                          {/* Fase 2.5.1 — avisos orientados ao operador (sem termos técnicos) */}
                          <SalesComposerStatus
                            noRoute={salesRouteEndpointState === 'unresolved'}
                            noRecentInbound={showNoInboundHint}
                          />

                          {/* Switch "Responder por" — só existe com a feature ON */}
                          <ManualReplySelector state={manualReply} />

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
                                <>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowTemplates(true)}
                                    title={outOfWindowCopy}
                                    className="h-10 w-10"
                                  >
                                    <FileText className="h-5 w-5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <MediaUploadButton
                                    onFileSelected={handleFileSelected}
                                    onTemplateClick={lowEndpointWindowBlocked ? undefined : () => setShowTemplates(true)}
                                    onNoteClick={() => setIsNoteMode(true)}
                                    disabled={submitting || mediaUploading}
                                  />
                                  <AudioRecorder
                                    onSend={handleAudioSend}
                                    onSendAsDocument={handleAudioSendAsDocument}
                                    disabled={submitting || mediaUploading}
                                    endpointId={composerEndpointId ?? null}
                                    threadId={selectedThreadId}
                                    organizationId={organization?.id ?? null}
                                  />



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
                              {/* Snippets — painel flutuante, controlado pelo slash command */}
                              {serviceWindow.isOpen && snippets.length > 0 && snippetPickerOpen && (
                                <SnippetsPickerPanel
                                  snippets={snippets}
                                  query={snippetShortcutQuery ?? ''}
                                  onSelect={(s) => {
                                    applySnippet(s);
                                    setSnippetPickerOpen(false);
                                    setSnippetShortcutQuery(undefined);
                                  }}
                                  onClose={() => {
                                    setSnippetPickerOpen(false);
                                    setSnippetShortcutQuery(undefined);
                                  }}
                                />
                              )}
                              <Textarea
                                ref={textareaRef}
                                placeholder={outOfWindow
                                  ? outOfWindowCopy
                                  : replyEndpointBlocked && !isNoteMode
                                  ? (manualReply.composerBlockedPlaceholder ?? 'Escolha um número permitido para responder.')
                                  : isNoteMode
                                    ? (locale === 'pt-BR' ? 'Escreva uma nota interna...' : 'Write an internal note...')
                                    : (locale === 'pt-BR' ? "Digite uma mensagem ou '/' para respostas rápidas" : "Type a message or '/' for quick replies")}
                                value={messageText}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMessageText(v);
                                  adjustTextareaHeight();
                                  // Slash command: abre picker enquanto o texto começar com "/"
                                  const q = extractSnippetQuery(v);
                                  if (serviceWindow.isOpen && snippets.length > 0 && q !== null) {
                                    setSnippetShortcutQuery(q);
                                    setSnippetPickerOpen(true);
                                  } else if (snippetPickerOpen) {
                                    setSnippetPickerOpen(false);
                                    setSnippetShortcutQuery(undefined);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape' && snippetPickerOpen) {
                                    e.preventDefault();
                                    setSnippetPickerOpen(false);
                                    setSnippetShortcutQuery(undefined);
                                    return;
                                  }
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (snippetPickerOpen) {
                                      // Seleciona o primeiro snippet visível
                                      const q = (snippetShortcutQuery ?? '').trim().toLowerCase();
                                      const list = q
                                        ? snippets.filter((s) => (
                                            s.title.toLowerCase().includes(q) ||
                                            (s.shortcut ?? '').toLowerCase().includes(q) ||
                                            s.body.toLowerCase().includes(q)
                                          ))
                                        : snippets;
                                      if (list.length > 0) {
                                        applySnippet(list[0]);
                                        setSnippetPickerOpen(false);
                                        setSnippetShortcutQuery(undefined);
                                      }
                                      return;
                                    }
                                    handleSendMessage();
                                    if (textareaRef.current) {
                                      textareaRef.current.style.height = 'auto';
                                    }
                                    setTextareaOverflow(false);
                                  }
                                }}
                                rows={1}
                                disabled={outOfWindow || (replyEndpointBlocked && !isNoteMode)}
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
                              disabled={
                                outOfWindow ||
                                submitting ||
                                !messageText.trim() ||
                                (replyEndpointBlocked && !isNoteMode)
                              }
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

      {/* Vincular mídia recebida como documento (triagem inline) */}
      {attach && selectedThread?.contact_id && organization?.id && (
        <AttachMediaDialog
          open={!!attach && !attachPicking}
          onOpenChange={(o) => { if (!o) { setAttach(null); setAttachPicking(false); } }}
          organizationId={organization.id}
          contactId={selectedThread.contact_id}
          contactName={selectedThread.contact_name}
          opportunities={contactOpportunities}
          pages={attach.pages}
          onPagesChange={(p) => setAttach({ pages: p })}
          onPickMore={() => setAttachPicking(true)}
          onAttached={async (info) => {
            const urls = new Set(info.sourceUrls);
            const linked = { type_name: info.typeName, at: new Date().toISOString() };
            const targets = (messages as any[]).filter((m) => m.media_urls?.[0] && urls.has(m.media_urls[0]));
            // Selo imediato (otimista) + persiste em messages.metadata.attached_document
            setMessages((prev) => prev.map((m: any) => (targets.some((t) => t.id === m.id) ? { ...m, metadata: { ...(m.metadata || {}), attached_document: linked } } : m)));
            await Promise.all(targets.map((m: any) =>
              supabase.from('messages').update({ metadata: { ...(m.metadata || {}), attached_document: linked } }).eq('id', m.id),
            ));
          }}
        />
      )}
      {/* Barra do modo de seleção: escolher a próxima página vendo a foto na conversa */}
      {attach && attachPicking && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-background shadow-lg px-4 py-2">
          <span className="text-sm">Toque em <strong>“Adicionar esta página”</strong> na foto desejada · {attach.pages.length} {attach.pages.length === 1 ? 'página' : 'páginas'}</span>
          <Button size="sm" onClick={() => setAttachPicking(false)}>Voltar ao documento</Button>
        </div>
      )}

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
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === 'won') {
            setPendingCloseDate(confirmAction);
            setConfirmAction(null);
          } else void handleMarkOpportunity(confirmAction.kind, confirmAction.opp);
        }}
      />

      {pendingCloseDate?.kind === 'won' && organization ? <OpportunityCloseDialog
        open
        onOpenChange={(open) => !open && setPendingCloseDate(null)}
        opportunityId={pendingCloseDate.opp.id}
        contactId={pendingCloseDate.opp.contact_id}
        targetStageId={pipelineStages.find((stage) => stage.type === 'won')?.id || ''}
        initialCloseDate={pendingCloseDate.opp.close_date}
        source="inbox"
        onSuccess={() => {
          setContactOpportunities((current) => current.filter((item) => item.id !== pendingCloseDate.opp.id));
          setPendingCloseDate(null);
        }}
      /> : <CloseDatePromptDialog
        open={pendingCloseDate?.kind === 'lost'}
        onOpenChange={(o) => !o && setPendingCloseDate(null)}
        title={locale === 'pt-BR' ? 'Marcar como Perdido' : 'Mark as Lost'}
        loading={markingOpp}
        onConfirm={(date) => pendingCloseDate && handleMarkOpportunity(pendingCloseDate.kind, pendingCloseDate.opp, date)}
      />}

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
