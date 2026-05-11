import { useMemo, useState } from 'react';
import { computeRange, type PeriodPreset, type CustomRange } from '@/lib/report-period';

export function useMarketingPeriod(initial: PeriodPreset = 'last_30') {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState<CustomRange | undefined>();

  const range = useMemo(() => computeRange(preset, custom), [preset, custom]);

  return { preset, setPreset, custom, setCustom, range };
}
