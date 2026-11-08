import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { evaluateOpportunityClose, type OpportunityCloseEvaluation } from '@/lib/opportunityClose';
import { uiText, useUiLocale } from '@/lib/ui-locale';

// compact/onEditContact/reloadKey: uso no painel Atalhos do Comercial (sem sair do chat).
// A avaliação é a mesma RPC do diálogo de fechamento (evaluate_opportunity_close_v1).
export function OpportunityReadinessCard({ organizationId, opportunityId, onGoToDocuments, onEditContact, compact = false, reloadKey = 0 }: {
  organizationId: string;
  opportunityId: string;
  onGoToDocuments?: () => void;
  onEditContact?: () => void;
  compact?: boolean;
  reloadKey?: number;
}) {
  useUiLocale();
  const [evaluation, setEvaluation] = useState<OpportunityCloseEvaluation | null>(null);

  useEffect(() => {
    let active = true;
    evaluateOpportunityClose(organizationId, opportunityId)
      .then((result) => active && setEvaluation(result))
      .catch(() => active && setEvaluation(null));
    return () => { active = false; };
  }, [organizationId, opportunityId, reloadKey]);

  if (!evaluation || evaluation.mode === 'off') return null;
  const ready = evaluation.missing_count === 0 || evaluation.fallback_used;

  return (
    <Card className={compact ? 'border-0 shadow-none bg-transparent' : 'mt-4'}>
      <CardHeader className={compact ? 'flex-row items-center justify-between space-y-0 p-0 pb-2' : 'flex-row items-center justify-between space-y-0 pb-3'}>
        {compact
          ? <p className="text-xs font-medium text-muted-foreground">{uiText('Prontidão para ganhar')}</p>
          : <CardTitle className="text-base">Prontidão para ganhar</CardTitle>}
        <Badge variant={ready ? 'default' : evaluation.mode === 'enforce' ? 'destructive' : 'secondary'}>
          {ready ? uiText('Pronta') : evaluation.mode === 'enforce' ? uiText('Bloqueada') : uiText('Atenção')}
        </Badge>
      </CardHeader>
      <CardContent className={compact ? 'space-y-1.5 p-0' : 'space-y-2'}>
        {evaluation.items.map((item) => (
          <div key={item.code} className={`flex items-center justify-between gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
            <span className="flex items-center gap-2">
              {item.status === 'passed' ? <CheckCircle className="text-emerald-600" weight="fill" />
                : item.status === 'warning' ? <WarningCircle className="text-amber-600" weight="fill" />
                : <XCircle className="text-destructive" weight="fill" />}
              {item.label}
            </span>
            {item.status === 'missing' && evaluation.contact_id && item.action === 'edit_contact' && (
              onEditContact
                ? <Button variant="link" size="sm" className={compact ? 'h-auto p-0 text-xs' : undefined} onClick={onEditContact}>{uiText('Corrigir')}</Button>
                : <Button asChild variant="link" size="sm"><Link to={`/contacts/${evaluation.contact_id}/edit`}>Corrigir</Link></Button>
            )}
            {item.status === 'missing' && item.action === 'edit_documents' && onGoToDocuments && (
              <Button variant="link" size="sm" className={compact ? 'h-auto p-0 text-xs' : undefined} onClick={onGoToDocuments}>{compact ? uiText('Ver documentos') : 'Ir para Documentos'}</Button>
            )}
            {item.status === 'missing' && item.action === 'classify' && (
              <span className="text-xs text-muted-foreground">{compact ? uiText('Na tela da oportunidade') : 'Card "Classificação do processo"'}</span>
            )}
          </div>
        ))}
        {evaluation.mode === 'monitor' && evaluation.missing_count > 0 && (
          <p className="pt-2 text-xs text-muted-foreground">{uiText('Modo monitor: estas pendências ainda não bloqueiam o ganho.')}</p>
        )}
      </CardContent>
    </Card>
  );
}
