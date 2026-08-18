// ============================================================================
// Linha de preview da última mensagem na lista de conversas (conceito WhatsApp).
//
// Apresentacional apenas: ícone de status (só outbound) + ícone de mídia +
// texto em uma única linha. O status vem exclusivamente de
// `messages.whatsapp_status` — nenhum estado é inferido por provider, então
// providers que não confirmam leitura simplesmente param em ✓.
// ============================================================================

import {
  Check,
  Checks,
  Clock,
  FileText,
  Image as ImageIcon,
  Microphone,
  Sticker,
  VideoCamera,
  WarningCircle,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { LastMessagePreview as Preview, LastMessagePreviewKind } from '@/lib/messagePreview';

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0';

function StatusIcon({ status }: { status: string | null | undefined }) {
  switch (status) {
    case 'sending':
    case 'queued':
    case 'pending':
      return <Clock weight="light" className={cn(ICON_CLASS, 'text-muted-foreground')} />;
    case 'sent':
      return <Check weight="light" className={cn(ICON_CLASS, 'text-muted-foreground')} />;
    case 'delivered':
      return <Checks weight="light" className={cn(ICON_CLASS, 'text-muted-foreground')} />;
    case 'read':
      return <Checks weight="light" className={cn(ICON_CLASS, 'text-sky-400')} />;
    case 'failed':
      return <WarningCircle weight="fill" className={cn(ICON_CLASS, 'text-destructive')} />;
    default:
      return null;
  }
}

function MediaIcon({ kind }: { kind: LastMessagePreviewKind }) {
  switch (kind) {
    case 'audio':
      return <Microphone weight="light" className={ICON_CLASS} />;
    case 'image':
      return <ImageIcon weight="light" className={ICON_CLASS} />;
    case 'video':
      return <VideoCamera weight="light" className={ICON_CLASS} />;
    case 'document':
      return <FileText weight="light" className={ICON_CLASS} />;
    case 'sticker':
      return <Sticker weight="light" className={ICON_CLASS} />;
    default:
      return null;
  }
}

interface Props {
  preview: Preview | null;
  /** `messages.direction` da última mensagem. */
  direction?: string | null;
  /** `messages.whatsapp_status` da última mensagem. */
  status?: string | null;
  className?: string;
}

export function LastMessagePreviewLine({ preview, direction, status, className }: Props) {
  if (!preview) return null;
  const isOutbound = direction === 'outbound';

  return (
    <p
      className={cn(
        'mt-0.5 flex items-center gap-1 text-xs text-muted-foreground min-w-0',
        className,
      )}
    >
      {isOutbound && <StatusIcon status={status} />}
      <MediaIcon kind={preview.kind} />
      <span className="truncate whitespace-nowrap">{preview.text}</span>
    </p>
  );
}
