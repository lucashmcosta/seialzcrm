import { lazy, Suspense } from 'react';
import { useProcessClassificationEnabled } from './useProcessClassificationEnabled';

const ProcessClassificationCard = lazy(() =>
  import('./ProcessClassificationCard').then((m) => ({ default: m.ProcessClassificationCard })));

/** Card da Visão geral da oportunidade. Só carrega o assistente quando o módulo está ligado na org. */
export function ProcessClassificationSlot({ opportunityId }: { opportunityId: string }) {
  const enabled = useProcessClassificationEnabled();
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <ProcessClassificationCard opportunityId={opportunityId} />
    </Suspense>
  );
}
