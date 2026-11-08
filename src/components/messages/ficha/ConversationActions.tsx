// Bloco "Conversa" do painel Atalhos: as mesmas ações do antigo menu "Ações" do
// cabeçalho (assumir, atribuir, resolver/reabrir, devolver ao AI, ocultar).
// Nenhuma lógica nova: só chama os handlers do MessagesList, com as mesmas
// permissões (canAssign / canClose) e os mesmos motivos de bloqueio.
import { UserCheck, CheckCircle, ArrowCounterClockwise, Robot, EyeSlash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import { PermissionGate } from '@/components/permissions/PermissionGate';
import { uiText, useUiLocale } from '@/lib/ui-locale';

export type ConversationActionsProps = {
  status: string;
  assignedUserId: string | null;
  isAssignedToMe: boolean;
  canAssign: boolean;
  canClose: boolean;
  denyAssignReason: string;
  denyCloseReason: string;
  showReturnToAI: boolean;
  onTakeOver: () => void;
  onAssign: (userId: string | null) => void;
  onResolve: () => void;
  onReopen: () => void;
  onReturnToAI: () => void;
  onHide: () => void;
};

export function ConversationActions(p: ConversationActionsProps) {
  useUiLocale();
  const isResolved = p.status === 'resolved';
  const canResolveStatus = ['open', 'awaiting_client', 'in_progress'].includes(p.status);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{uiText('Conversa')}</h3>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{uiText('Responsável pela conversa')}</Label>
        <PermissionGate allowed={p.canAssign} reason={p.denyAssignReason} className="w-full">
          <OwnerSelector value={p.assignedUserId} onChange={p.onAssign} size="sm" placeholder={uiText('Atribuir a...')} />
        </PermissionGate>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {!p.isAssignedToMe && !isResolved && (
          <Button
            type="button" variant="outline" size="sm" className="px-1 text-xs"
            disabled={!p.canAssign} title={p.canAssign ? undefined : p.denyAssignReason}
            onClick={p.onTakeOver}
          >
            <UserCheck className="h-3.5 w-3.5 mr-1" />{uiText('Assumir')}
          </Button>
        )}
        {canResolveStatus && (
          <Button
            type="button" variant="outline" size="sm" className="px-1 text-xs"
            disabled={!p.canClose} title={p.canClose ? undefined : p.denyCloseReason}
            onClick={p.onResolve}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1" />{uiText('Resolver')}
          </Button>
        )}
        {isResolved && (
          <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={p.onReopen}>
            <ArrowCounterClockwise className="h-3.5 w-3.5 mr-1" />{uiText('Reabrir')}
          </Button>
        )}
        {p.showReturnToAI && (
          <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={p.onReturnToAI}>
            <Robot className="h-3.5 w-3.5 mr-1" />{uiText('Devolver ao AI')}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={p.onHide}>
          <EyeSlash className="h-3.5 w-3.5 mr-1" />{uiText('Ocultar')}
        </Button>
      </div>
    </section>
  );
}
