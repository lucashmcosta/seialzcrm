import { lazy, Suspense } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import type { WidgetContext } from '../types';

// Carregado sob demanda: o registro de widgets fica na raiz do app e não deve levar o formulário junto.
const PlamevQuoteForm = lazy(() => import('./PlamevQuoteForm').then((m) => ({ default: m.PlamevQuoteForm })));

/** Cotação Plamev na janela do Workspace. Independe de tela (contextMode 'none'); usa a org atual. */
export function PlamevQuoteWidget(_: { context: WidgetContext }) {
  const { organization } = useOrganization();
  if (!organization?.id) return null;
  return (
    <Suspense fallback={<SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}>
      <PlamevQuoteForm organizationId={organization.id} />
    </Suspense>
  );
}
