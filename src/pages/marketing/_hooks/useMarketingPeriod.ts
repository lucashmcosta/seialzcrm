import { useMemo } from 'react';
import { computeRange, type PeriodPreset, type CustomRange } from '@/lib/report-period';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';

export function useMarketingPeriod(initial: PeriodPreset = 'last_30', scope = 'marketing') {
  const [preset, setPreset, , presetHydrated] = usePersistedFilters<PeriodPreset>(`${scope}.preset`, initial);
  const [custom, setCustom, , customHydrated] = usePersistedFilters<CustomRange | undefined>(
    `${scope}.custom`,
    undefined,
    (raw) => {
      if (!raw || typeof raw !== 'object') return undefined;
      return {
        from: raw.from ? new Date(raw.from) : undefined,
        to: raw.to ? new Date(raw.to) : undefined,
      };
    },
  );

  const range = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const hydrated = presetHydrated && customHydrated;

  return { preset, setPreset, custom, setCustom, range, hydrated };
}
