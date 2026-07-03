import { useMemo, useState } from 'react';
import type { Locale } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { ChatCircle, Headset, ArrowUpRight, User, SpinnerGap } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import {
  useContactConversationsByContext,
  type ContextThreadRow,
  type BusinessContext,
} from '@/hooks/contacts/useContactConversationsByContext';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  contactId: string;
}

interface CardConfig {
  context: BusinessContext;
  title: string;
  icon: React.ReactNode;
  route: (threadId: string) => string;
  createIntent: 'sales' | 'customer_service';
  dialogTitle: string;
  emptyLabel: string;
  emptyCta: string;
  openCta: string;
}

export function ContactConversations({ contactId }: Props) {
  const { locale } = useOrganization();
  const { t: _t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const navigate = useNavigate();
  const isPtBr = (locale ?? 'pt-BR') === 'pt-BR';
  const dateLocale = isPtBr ? ptBR : enUS;

  const { data, isLoading, refetch } = useContactConversationsByContext(contactId);
  const [creatingIntent, setCreatingIntent] = useState<'sales' | 'customer_service' | null>(null);

  const configs = useMemo<CardConfig[]>(
    () => [
      {
        context: 'sales',
        title: isPtBr ? 'Comercial' : 'Sales',
        icon: <ChatCircle className="h-5 w-5" weight="duotone" />,
        route: (threadId) => `/messages?thread=${threadId}`,
        createIntent: 'sales',
        dialogTitle: isPtBr ? 'Nova Conversa Comercial' : 'New Sales Conversation',
        emptyLabel: isPtBr
          ? 'Nenhuma conversa comercial ainda.'
          : 'No sales conversation yet.',
        emptyCta: isPtBr ? 'Iniciar conversa comercial' : 'Start sales conversation',
        openCta: isPtBr ? 'Abrir conversa comercial' : 'Open sales conversation',
      },
      {
        context: 'customer_service',
        title: isPtBr ? 'Atendimento' : 'Customer Service',
        icon: <Headset className="h-5 w-5" weight="duotone" />,
        route: (threadId) => `/inbox?thread=${threadId}`,
        createIntent: 'customer_service',
        dialogTitle: isPtBr ? 'Novo Atendimento' : 'New Service Conversation',
        emptyLabel: isPtBr ? 'Nenhum atendimento ainda.' : 'No service conversation yet.',
        emptyCta: isPtBr ? 'Iniciar atendimento' : 'Start service conversation',
        openCta: isPtBr ? 'Abrir atendimento' : 'Open service',
      },
    ],
    [isPtBr],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <SpinnerGap className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {configs.map((cfg) => {
          const thread = cfg.context === 'sales' ? data?.sales ?? null : data?.customer_service ?? null;
          return (
            <ConversationCard
              key={cfg.context}
              cfg={cfg}
              thread={thread}
              dateLocale={dateLocale}
              isPtBr={isPtBr}
              onOpen={() => thread && navigate(cfg.route(thread.id))}
              onStart={() => setCreatingIntent(cfg.createIntent)}
            />
          );
        })}
      </div>

      {creatingIntent && (
        <NewConversationDialog
          open={!!creatingIntent}
          onOpenChange={(o) => !o && setCreatingIntent(null)}
          intent={creatingIntent}
          initialContactId={contactId}
          title={
            creatingIntent === 'sales'
              ? isPtBr
                ? 'Nova Conversa Comercial'
                : 'New Sales Conversation'
              : isPtBr
                ? 'Novo Atendimento'
                : 'New Service Conversation'
          }
          routingDecision={
            creatingIntent === 'customer_service'
              ? {
                  action: 'inbox_manual_start',
                  by_user_id: null,
                  from: 'contact_detail',
                  at: new Date().toISOString(),
                }
              : undefined
          }
          onSelectContact={async (_c, threadId) => {
            const intent = creatingIntent;
            setCreatingIntent(null);
            await refetch();
            if (intent === 'sales') navigate(`/messages?thread=${threadId}`);
            else navigate(`/inbox?thread=${threadId}`);
          }}
        />
      )}
    </>
  );
}

interface ConversationCardProps {
  cfg: CardConfig;
  thread: ContextThreadRow | null;
  dateLocale: Locale;
  isPtBr: boolean;
  onOpen: () => void;
  onStart: () => void;
}

function ConversationCard({ cfg, thread, dateLocale, isPtBr, onOpen, onStart }: ConversationCardProps) {
  const empty = !thread;
  const hasMessages = !!thread?.last_message_at;

  const statusLabel = (() => {
    if (!thread) return '—';
    const s = thread.status ?? 'open';
    if (isPtBr) {
      return {
        open: 'Aberta',
        in_progress: 'Em andamento',
        awaiting_client: 'Aguardando cliente',
        resolved: 'Resolvida',
        closed: 'Fechada',
      }[s] ?? s;
    }
    return s;
  })();

  const endpointAddress = thread?.endpoint?.external_address ?? null;
  const lastActivity = thread?.last_message_at
    ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true, locale: dateLocale })
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-primary">{cfg.icon}</div>
          <h3 className="text-base font-semibold">{cfg.title}</h3>
        </div>
        {thread && (
          <Badge variant="secondary" className="text-xs">
            {statusLabel}
          </Badge>
        )}
      </div>

      {empty ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-muted-foreground">{cfg.emptyLabel}</p>
          <Button size="sm" onClick={onStart}>
            {cfg.emptyCta}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {endpointAddress && (
                <span className="font-mono text-xs">{endpointAddress}</span>
              )}
              <span className="flex items-center gap-1 text-xs">
                <User className="h-3.5 w-3.5" />
                {thread.assigned_user_name ?? (isPtBr ? 'Sem responsável' : 'Unassigned')}
              </span>
            </div>

            <div className="rounded-md bg-muted/40 px-3 py-2 min-h-[52px]">
              {hasMessages ? (
                <>
                  <p className="text-sm text-foreground line-clamp-2 break-words">
                    {thread.last_message_direction === 'outbound' ? (isPtBr ? 'Você: ' : 'You: ') : ''}
                    {thread.last_message_content ?? '—'}
                  </p>
                  {lastActivity && (
                    <p className="text-xs text-muted-foreground mt-1">{lastActivity}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {isPtBr
                    ? cfg.context === 'customer_service'
                      ? 'Atendimento iniciado, sem mensagens ainda.'
                      : 'Conversa iniciada, sem mensagens ainda.'
                    : 'Started, no messages yet.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <Button size="sm" onClick={onOpen} className="gap-1.5">
              {cfg.openCta}
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
