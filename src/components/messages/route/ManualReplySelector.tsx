// ============================================================================
// Switch "Responder por" (Comercial) — UI discreta no composer.
// Puramente apresentacional: todos os estados vêm de `useManualReplyEndpoint`.
// Não renderiza nada quando a feature está OFF / fora do escopo Comercial.
// ============================================================================

import { CaretDown, Check, SpinnerGap, WhatsappLogo } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { last4, providerLabel } from './RouteIndicators';
import type { ManualReplyOption, ManualReplyState } from '@/hooks/messages/useManualReplyEndpoint';

function optionLabel(option: ManualReplyOption): string {
  return `••••${last4(option.address)} · ${providerLabel(option.provider)}`;
}

export function ManualReplySelector({ state }: { state: ManualReplyState }) {
  // Feature OFF, fora do escopo Comercial ou sem endpoints autorizados:
  // nada é exibido (o comportamento Automático segue inalterado).
  if (state.uiState === 'disabled' || state.uiState === 'no_endpoints') return null;

  if (state.uiState === 'loading') {
    return (
      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] text-muted-foreground">
        <SpinnerGap size={12} className="animate-spin" />
        Carregando números disponíveis…
      </div>
    );
  }

  if (state.uiState === 'error') {
    return (
      <div className="px-1 pb-1.5 text-[11px] text-amber-700 dark:text-amber-400">
        {state.errorMessage ?? 'Não foi possível carregar os números disponíveis.'}
      </div>
    );
  }

  const current = state.selectedOption;
  const isManual = state.selectionSource === 'manual';
  const currentLabel = current
    ? optionLabel(current)
    : state.selectedEndpointId
      ? '••••'
      : 'Número não definido';

  const apply = async (fn: () => Promise<void>, successMsg: string) => {
    try {
      await fn();
      toast({ description: successMsg });
    } catch (err) {
      toast({
        variant: 'destructive',
        description: (err as Error).message || 'Não foi possível aplicar a escolha de número.',
      });
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-1 pb-1.5">
      <span className="text-[11px] text-muted-foreground">Responder por:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={state.isMutating}
            className={cn(
              'h-6 gap-1 px-1.5 text-[11px] font-medium',
              current && 'text-foreground',
            )}
          >
            <WhatsappLogo size={12} weight="fill" className="text-emerald-500" />
            {currentLabel}
            <CaretDown size={10} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Número de resposta
          </DropdownMenuLabel>
          {isManual && state.derivedOption ? (
            <>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => {
                  void apply(
                    state.useDerived,
                    `Respostas voltam a sair por ${optionLabel(state.derivedOption!)} (última mensagem).`,
                  );
                }}
              >
                <span className="flex-1">
                  Seguir a última mensagem · {optionLabel(state.derivedOption)}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {state.options.map((option) => (
            <DropdownMenuItem
              key={option.endpointId}
              disabled={!option.available}
              className="text-xs"
              onSelect={() => {
                if (!option.available) {
                  toast({
                    variant: 'destructive',
                    description: 'Número indisponível no momento. Escolha outro número.',
                  });
                  return;
                }
                void apply(
                  () => state.selectEndpoint(option.endpointId),
                  `Respostas desta conversa sairão por ${optionLabel(option)}.`,
                );
              }}
            >
              <WhatsappLogo size={12} weight="fill" className="text-emerald-500" />
              <span className="flex-1">{optionLabel(option)}</span>
              {!option.available ? (
                <span className="text-[10px] text-muted-foreground">indisponível</span>
              ) : option.endpointId === current?.endpointId ? (
                <Check size={12} />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
