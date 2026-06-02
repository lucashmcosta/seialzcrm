import { useEffect, useState } from 'react';

interface Props {
  channel: string | null;
  lastInboundAt: string | null;
}

function format(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function WhatsAppWindowChip({ channel, lastInboundAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (channel !== 'whatsapp') return null;

  if (!lastInboundAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
        Sem inbound · só template
      </span>
    );
  }

  const expiresAt = new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000;
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        Fora da janela 24h · só template
      </span>
    );
  }

  const isWarning = remaining < 2 * 60 * 60 * 1000;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
      <span className={`w-1.5 h-1.5 rounded-full ${isWarning ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
      Janela aberta · expira em {format(remaining)}
    </span>
  );
}
