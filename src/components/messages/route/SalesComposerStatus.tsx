// ============================================================================
// Fase 2.5.1 — avisos do composer Comercial (apresentacional).
// Nenhuma lógica de gate aqui: os booleanos vêm de quem renderiza.
// Nunca exibir linguagem técnica (Sem Route, REPLY_ROUTE_UNRESOLVED, 24h).
// ============================================================================

import { Warning } from '@phosphor-icons/react';
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
      <div className="flex items-start gap-1.5">
        <Warning size={13} weight="bold" className="mt-[1px] shrink-0 text-amber-500" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
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
    return <Notice title="Sem inbound recente" subtitle="Somente template disponível." />;
  }

  return null;
}
