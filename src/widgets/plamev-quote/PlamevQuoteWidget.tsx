import { lazy, Suspense } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import type { WidgetContext } from '../types';

// Carregado sob demanda: o registro de widgets fica na raiz do app e não deve levar o formulário junto.
// Com chunk que não carrega, o guard de chunk do main.tsx engole o erro e o import resolve undefined: vira erro
// claro para o WidgetErrorBoundary da janela.
const PlamevQuoteForm = lazy(() => import('./PlamevQuoteForm').then((m) => {
  if (!m) throw new Error('Failed to fetch dynamically imported module: PlamevQuoteForm');
  return { default: m.PlamevQuoteForm };
}));

/**
 * Cotação Plamev na janela do Workspace. Funciona em qualquer tela (contextMode 'none'); numa oportunidade preenche
 * com o contato dela e salva a cotação nela; numa conversa/contato só preenche.
 */
export function PlamevQuoteWidget({ context }: { context: WidgetContext }) {
  const { organization } = useOrganization();
  if (!organization?.id) return null;
  const opportunityId = context.screen === 'opportunities' ? context.opportunityId : null;
  const contactId = 'contactId' in context ? context.contactId : null;
  return (
    <Suspense fallback={<SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}>
      {/* key: trocar de oportunidade/contato começa uma cotação nova */}
      <PlamevQuoteForm key={opportunityId ?? contactId ?? 'livre'} organizationId={organization.id}
        opportunityId={opportunityId} contactId={contactId} />
    </Suspense>
  );
}
