import { lazy, Suspense, useMemo } from 'react';
import { useOrgWidgetConfig } from '@/widgets/useOrgWidgets';

export const PROCESS_CLASSIFICATION_KEY = 'process_classification';

/** Módulo ligado na org (organization_widgets). Sem módulo, nada é chamado nem carregado. */
export function useProcessClassificationEnabled() {
  const { data } = useOrgWidgetConfig();
  return useMemo(() => !!data?.widgets.some((w) => w.widget_key === PROCESS_CLASSIFICATION_KEY && w.is_enabled), [data]);
}

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
