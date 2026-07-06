import { useServiceWindow } from '@/hooks/useServiceWindow';
import { formatRemaining, type ContactCtwaInputs } from '@/lib/serviceWindow';

interface Props {
  channel: string | null;
  lastInboundAt: string | null;
  /** Se conhecido, evita fetch — passe os campos CTWA do contato direto. */
  contact?: ContactCtwaInputs | null;
  /** Alternativa: contactId para o hook resolver os campos CTWA. */
  contactId?: string | null;
}

/**
 * Dois chips independentes:
 *  - conversationWindow (24h) → gate de freeform.
 *  - billingWindow (72h CTWA) → gate de gratuidade de templates.
 */
export function WhatsAppWindowChip({ channel, lastInboundAt, contact, contactId }: Props) {
  const window = useServiceWindow({
    contact: contact ?? null,
    contactId: contactId ?? null,
    lastInboundAt,
  });

  if (channel !== 'whatsapp') return null;

  const { conversation, billing } = window;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <ConversationChip window={conversation} />
      {billing.isCtwaContact && <BillingChip window={billing} />}
    </span>
  );
}

function ConversationChip({ window }: { window: ReturnType<typeof useServiceWindow>['conversation'] }) {
  if (window.status === 'never') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        Sem inbound · só template
      </span>
    );
  }
  if (!window.isOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        24h fechada · só template
      </span>
    );
  }
  const isWarning = window.remainingMs < 2 * 60 * 60 * 1000;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
      <span className={`w-1.5 h-1.5 rounded-full ${isWarning ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
      Sessão 24h · {formatRemaining(window.remainingMs)}
    </span>
  );
}

function BillingChip({ window }: { window: ReturnType<typeof useServiceWindow>['billing'] }) {
  if (!window.expiresAt) return null;
  if (!window.isOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        CTWA 72h encerrada · templates cobrados
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300"
      title="Janela CTWA — templates gratuitos"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
      Templates gratuitos · {formatRemaining(window.remainingMs)}
    </span>
  );
}
