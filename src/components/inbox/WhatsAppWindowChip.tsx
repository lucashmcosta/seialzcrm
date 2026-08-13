import { useServiceWindow } from '@/hooks/useServiceWindow';
import { formatRemaining, type ContactCtwaInputs } from '@/lib/serviceWindow';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'soft';

interface Props {
  channel: string | null;
  lastInboundAt: string | null;
  /** Se conhecido, evita fetch — passe os campos CTWA do contato direto. */
  contact?: ContactCtwaInputs | null;
  /** Alternativa: contactId para o hook resolver os campos CTWA. */
  contactId?: string | null;
  /**
   * Fase 2.5.2 — `soft` é usado apenas pelo Comercial: janela fechada em âmbar
   * discreto e sem animação. `default` mantém o visual histórico (Atendimento/Mobile).
   */
  tone?: Tone;
}

/**
 * Dois chips independentes:
 *  - conversationWindow (24h) → gate de freeform.
 *  - billingWindow (72h CTWA) → gate de gratuidade de templates.
 */
export function WhatsAppWindowChip({ channel, lastInboundAt, contact, contactId, tone = 'default' }: Props) {
  const window = useServiceWindow({
    contact: contact ?? null,
    contactId: contactId ?? null,
    lastInboundAt,
  });

  if (channel !== 'whatsapp') return null;

  const { conversation, billing } = window;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <ConversationChip window={conversation} tone={tone} />
      {billing.isCtwaContact && <BillingChip window={billing} tone={tone} />}
    </span>
  );
}

const BASE = 'inline-flex items-center gap-1.5 py-0.5 rounded text-[10px] font-medium';

function ConversationChip({
  window,
  tone,
}: {
  window: ReturnType<typeof useServiceWindow>['conversation'];
  tone: Tone;
}) {
  const soft = tone === 'soft';
  const pad = soft ? 'px-1.5' : 'px-2';

  if (window.status === 'never') {
    return (
      <span className={cn(BASE, pad, 'bg-muted text-muted-foreground')}>
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        {soft ? 'Sem inbound recente' : 'Sem inbound · só template'}
      </span>
    );
  }
  if (!window.isOpen) {
    return soft ? (
      <span className={cn(BASE, pad, 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Sem inbound recente
      </span>
    ) : (
      <span className={cn(BASE, pad, 'bg-destructive/15 text-destructive')}>
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        24h fechada · só template
      </span>
    );
  }
  const isWarning = window.remainingMs < 2 * 60 * 60 * 1000;
  return (
    <span className={cn(BASE, pad, 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')}>
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isWarning ? 'bg-amber-500' : cn('bg-emerald-500', !soft && 'animate-pulse'),
        )}
      />
      Sessão 24h · {formatRemaining(window.remainingMs)}
    </span>
  );
}

function BillingChip({
  window,
  tone,
}: {
  window: ReturnType<typeof useServiceWindow>['billing'];
  tone: Tone;
}) {
  const soft = tone === 'soft';
  const pad = soft ? 'px-1.5' : 'px-2';

  if (!window.expiresAt) return null;
  if (!window.isOpen) {
    return (
      <span className={cn(BASE, pad, 'bg-muted text-muted-foreground')}>
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        CTWA 72h encerrada · templates cobrados
      </span>
    );
  }
  return (
    <span
      className={cn(BASE, pad, 'bg-sky-500/15 text-sky-700 dark:text-sky-300')}
      title="Janela CTWA — templates gratuitos"
    >
      <span className={cn('w-1.5 h-1.5 rounded-full bg-sky-500', !soft && 'animate-pulse')} />
      Templates gratuitos · {formatRemaining(window.remainingMs)}
    </span>
  );
}
