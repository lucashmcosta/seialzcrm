import { ReportFilters } from '@/components/reports/ReportFilters';
import type { PeriodPreset, CustomRange } from '@/lib/report-period';

interface Props {
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  custom?: CustomRange;
  setCustom: (c: CustomRange | undefined) => void;
}

export function PeriodFilter({ preset, setPreset, custom, setCustom }: Props) {
  return (
    <ReportFilters
      preset={preset}
      onPresetChange={setPreset}
      customRange={custom}
      onCustomRangeChange={setCustom}
      showOwner={false}
    />
  );
}
