import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { evaluateOpportunityClose, type OpportunityCloseEvaluation } from '@/lib/opportunityClose';

export function OpportunityReadinessCard({ organizationId, opportunityId, onGoToDocuments }: { organizationId: string; opportunityId: string; onGoToDocuments?: () => void }) {
  const [evaluation, setEvaluation] = useState<OpportunityCloseEvaluation | null>(null);

  useEffect(() => {
    let active = true;
    evaluateOpportunityClose(organizationId, opportunityId)
      .then((result) => active && setEvaluation(result))
      .catch(() => active && setEvaluation(null));
    return () => { active = false; };
  }, [organizationId, opportunityId]);

  if (!evaluation || evaluation.mode === 'off') return null;
  const ready = evaluation.missing_count === 0 || evaluation.fallback_used;

  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Prontidão para ganhar</CardTitle>
        <Badge variant={ready ? 'default' : evaluation.mode === 'enforce' ? 'destructive' : 'secondary'}>
          {ready ? 'Pronta' : evaluation.mode === 'enforce' ? 'Bloqueada' : 'Atenção'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {evaluation.items.map((item) => (
          <div key={item.code} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              {item.status === 'passed' ? <CheckCircle className="text-emerald-600" weight="fill" />
                : item.status === 'warning' ? <WarningCircle className="text-amber-600" weight="fill" />
                : <XCircle className="text-destructive" weight="fill" />}
              {item.label}
            </span>
            {item.status === 'missing' && evaluation.contact_id && item.action === 'edit_contact' && (
              <Button asChild variant="link" size="sm"><Link to={`/contacts/${evaluation.contact_id}/edit`}>Corrigir</Link></Button>
            )}
            {item.status === 'missing' && item.action === 'edit_documents' && onGoToDocuments && (
              <Button variant="link" size="sm" onClick={onGoToDocuments}>Ir para Documentos</Button>
            )}
          </div>
        ))}
        {evaluation.mode === 'monitor' && evaluation.missing_count > 0 && (
          <p className="pt-2 text-xs text-muted-foreground">Modo monitor: estas pendências ainda não bloqueiam o ganho.</p>
        )}
      </CardContent>
    </Card>
  );
}
