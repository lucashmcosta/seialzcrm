import { lazy, Suspense } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import type { WidgetContext } from '../types';

// Carregado sob demanda: o registro de widgets fica na raiz do app e não deve levar o assistente junto.
const ProcessClassificationCard = lazy(() =>
  import('@/components/process-classification/ProcessClassificationCard').then((m) => ({ default: m.ProcessClassificationCard })));

/** Classificação do processo na janela do Workspace: usa a oportunidade aberta na tela (contextMode 'opportunity'). */
export function ProcessClassificationWidget({ context }: { context: WidgetContext }) {
  if (context.screen !== 'opportunities' || !context.opportunityId) return null;
  return (
    <Suspense fallback={<SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}>
      <ProcessClassificationCard opportunityId={context.opportunityId} variant="inline" />
    </Suspense>
  );
}
