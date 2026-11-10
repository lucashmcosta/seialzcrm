import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EMPTY_LOSS_OPTIONS, type LossOptions } from '@/lib/lossReasons';

/** Opções de motivo/detalhe que a pessoa pode escolher, carregadas quando `enabled`. */
export function useLossOptions(organizationId: string | undefined, enabled: boolean) {
  const [options, setOptions] = useState<LossOptions>(EMPTY_LOSS_OPTIONS);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!organizationId || !enabled) return;
    let cancelled = false;
    setLoading(true);
    void Promise.resolve(supabase.rpc('list_loss_reason_options_v1', { _organization_id: organizationId }))
      .then(({ data }) => { if (!cancelled) setOptions((data as unknown as LossOptions | null) ?? EMPTY_LOSS_OPTIONS); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, enabled]);
  return { options, loading };
}

export interface LossChoice { reasonId: string | null; detailId: string | null; description: string }
export const EMPTY_LOSS_CHOICE: LossChoice = { reasonId: null, detailId: null, description: '' };

