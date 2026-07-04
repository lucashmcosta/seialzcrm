import { useServiceWindow } from '@/hooks/useServiceWindow';
import type { ContactCtwaInputs } from '@/lib/serviceWindow';

interface Props {
  channel: string | null;
  lastInboundAt: string | null;
  /** Se conhecido, evita fetch — passe os campos CTWA do contato direto. */
  contact?: ContactCtwaInputs | null;
  /** Alternativa: contactId para o hook resolver os campos CTWA. */
  contactId?: string | null;
}

export function WhatsAppWindowChip({ channel, lastInboundAt, contact, contactId }: Props) {
  const window = useServiceWindow({
    contact: contact ?? null,
    contactId: contactId ?? null,
    lastInboundAt,
  });

  if (channel !== 'whatsapp') return null;

  if (!window.expiresAt) {
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
        {window.reason} · só template
      </span>
    );
  }

  const isWarning = window.remainingMs < 2 * 60 * 60 * 1000;
  const isCtwa = window.originType === 'ctwa';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${
        isCtwa
          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isWarning ? 'bg-amber-500' : isCtwa ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
      {window.reason}
    </span>
  );
}
