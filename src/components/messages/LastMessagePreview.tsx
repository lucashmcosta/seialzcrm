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
import {
  buildLastMessagePreview,
  type LastMessagePreviewInput,
} from '@/lib/lastMessagePreview';

/**
 * Linha de preview da última mensagem (estilo WhatsApp) na lista de conversas.
 * Componente 100% apresentacional: uma linha, truncada, sem quebra.
 */
export function LastMessagePreview({
  content,
  direction,
  mediaType,
  whatsappStatus,
  className,
}: LastMessagePreviewInput & { className?: string }) {
  const preview = buildLastMessagePreview({ content, direction, mediaType, whatsappStatus });
  if (!preview) return null;

  const MediaIcon =
    preview.kind === 'audio'
      ? Microphone
      : preview.kind === 'image'
        ? ImageIcon
        : preview.kind === 'video'
          ? VideoCamera
          : preview.kind === 'document'
            ? FileText
            : preview.kind === 'sticker'
              ? Sticker
              : null;

  return (
    <div className={cn('flex items-center gap-1 min-w-0 text-xs text-muted-foreground', className)}>
      {preview.status === 'sending' && <Clock className="h-3 w-3 shrink-0" />}
      {preview.status === 'sent' && <Check className="h-3 w-3 shrink-0" />}
      {preview.status === 'delivered' && <Checks className="h-3 w-3 shrink-0" />}
      {preview.status === 'read' && (
        <Checks className="h-3 w-3 shrink-0 text-sky-500" weight="bold" />
      )}
      {preview.status === 'failed' && (
        <WarningCircle className="h-3 w-3 shrink-0 text-destructive" />
      )}
      {MediaIcon && <MediaIcon className="h-3 w-3 shrink-0" weight="fill" />}
      <span className="truncate whitespace-nowrap">{preview.text}</span>
    </div>
  );
}
