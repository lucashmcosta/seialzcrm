import { useState } from 'react';
import { Check, Checks, Clock, WarningCircle } from '@phosphor-icons/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getWhatsAppErrorInfo } from '@/lib/whatsappErrorReason';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  status: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sid?: string | null;
  sentAt?: string | null;
  /** Cor base dos ticks (ex.: 'text-white/70' para balão escuro) */
  iconClassName?: string;
}

/**
 * Ícone de status (sending/sent/delivered/read/failed).
 * Quando 'failed', expõe tooltip + popover com motivo legível e detalhes técnicos.
 */
export function MessageStatusIndicator({
  status,
  errorCode,
  errorMessage,
  sid,
  sentAt,
  iconClassName,
}: Props) {
  const [open, setOpen] = useState(false);

  if (status === 'failed') {
    const info = getWhatsAppErrorInfo(errorCode);
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <Popover open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                  className="inline-flex items-center justify-center p-0.5 -m-0.5 rounded hover:bg-destructive/10 focus:outline-none focus:ring-1 focus:ring-destructive"
                  aria-label={`Falha no envio: ${info.short}`}
                >
                  <WarningCircle weight="fill" className="w-3.5 h-3.5 text-destructive" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {info.short}
            </TooltipContent>
            <PopoverContent
              side="top"
              align="end"
              className="w-72 text-xs space-y-2 p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <WarningCircle weight="fill" className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-destructive">Não entregue</div>
                  <div className="text-foreground mt-0.5">{info.reason}</div>
                </div>
              </div>
              <div className="border-t pt-2 space-y-1 text-muted-foreground font-data">
                {errorCode && (
                  <div><span className="opacity-70">Código:</span> {errorCode}</div>
                )}
                {errorMessage && (
                  <div className="break-words">
                    <span className="opacity-70">Mensagem:</span> {errorMessage}
                  </div>
                )}
                {sid && (
                  <div className="break-all"><span className="opacity-70">SID:</span> {sid}</div>
                )}
                {sentAt && (
                  <div>
                    <span className="opacity-70">Quando:</span>{' '}
                    {format(new Date(sentAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </div>
                )}
                {!errorCode && !errorMessage && !sid && (
                  <div className="italic">Sem detalhes técnicos disponíveis.</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const cls = iconClassName ?? 'text-muted-foreground';
  switch (status) {
    case 'sending':
      return <Clock className={`w-3 h-3 ${cls}`} />;
    case 'sent':
      return <Check className={`w-3 h-3 ${cls}`} />;
    case 'delivered':
      return <Checks className={`w-3 h-3 ${cls}`} />;
    case 'read':
      return <Checks className="w-3 h-3 text-sky-400" />;
    default:
      return null;
  }
}

/**
 * Texto inline curto exibido abaixo do balão quando a mensagem falhou.
 * Mostra apenas o motivo legível; detalhes técnicos ficam no popover do ícone.
 */
export function MessageFailureInline({
  errorCode,
  className,
}: {
  errorCode?: string | null;
  className?: string;
}) {
  const info = getWhatsAppErrorInfo(errorCode);
  return (
    <div className={`text-[11px] text-destructive mt-1 ${className ?? ''}`}>
      Não entregue: {info.short}
    </div>
  );
}
