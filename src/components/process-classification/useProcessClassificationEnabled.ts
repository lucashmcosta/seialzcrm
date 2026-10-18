import { useMemo } from 'react';
import { useOrgWidgetConfig } from '@/widgets/useOrgWidgets';

export const PROCESS_CLASSIFICATION_KEY = 'process_classification';

/** Módulo ligado na org (organization_widgets). Sem módulo, nada é chamado nem carregado. */
export function useProcessClassificationEnabled() {
  const { data } = useOrgWidgetConfig();
  return useMemo(() => !!data?.widgets.some((w) => w.widget_key === PROCESS_CLASSIFICATION_KEY && w.is_enabled), [data]);
}
