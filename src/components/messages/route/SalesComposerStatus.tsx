// ============================================================================
// Fase 2.5.1 / 2.5.2 — avisos do composer Comercial (apresentacional).
// Nenhuma lógica de gate aqui: os booleanos vêm de quem renderiza.
// Nunca exibir linguagem técnica (Sem Route, REPLY_ROUTE_UNRESOLVED, 24h).
// ============================================================================

import { Warning } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { NO_ROUTE_TITLE, NO_ROUTE_TOOLTIP } from './RouteIndicators';

interface Props {
  /** Não há rota ativa resolvida para a conversa. */
  noRoute?: boolean;
  /** Não há inbound recente (janela de conversa fechada). */
  noRecentInbound?: boolean;
}

function Notice({ title, subtitle, tooltip }: { title: string; subtitle: string; tooltip?: string }) {
  return (
    <div className="px-1 pb-1.5" title={tooltip}>
      <Alert className="border-amber-500/30 bg-amber-500/10 px-3 py-2 [&>svg]:left-3 [&>svg]:top-2.5 [&>svg]:text-amber-500">
        <Warning size={14} weight="bold" />
        <AlertTitle className="mb-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          {title}
        </AlertTitle>
        <AlertDescription className="text-[11px] text-muted-foreground">{subtitle}</AlertDescription>
      </Alert>
    </div>
  );
}

export function SalesComposerStatus({ noRoute, noRecentInbound }: Props) {
  if (noRoute) {
    return (
      <Notice
        title={NO_ROUTE_TITLE}
        subtitle="Responder somente após nova mensagem do cliente."
        tooltip={NO_ROUTE_TOOLTIP}
      />
    );
  }

  if (noRecentInbound) {
    return (
      <Notice title="Sem inbound recente" subtitle="Somente mensagens de template estão disponíveis." />
    );
  }

  return null;
}
