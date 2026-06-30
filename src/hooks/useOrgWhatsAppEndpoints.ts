import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgEndpoint {
  id: string;
  external_address: string;
  display_name: string | null;
  provider: string | null;
  is_active: boolean;
  created_at: string;
  purpose: string | null;
}

/**
 * Cutoff timestamp imediatamente após o batch da migration
 * `populate_communication_endpoints_from_v2_senders` (2026-05-28 17:22:02.165649+00),
 * que populou `communication_endpoints` replicando os mesmos `whatsapp_senders`
 * em todas as orgs que compartilhavam o AccountSid Twilio — gerando duplicatas
 * fantasmas. Endpoints criados ANTES deste cutoff só passam se o address bater
 * com o whatsapp_number da própria org.
 */
const MIGRATION_GHOST_CUTOFF = '2026-05-28T17:22:03Z';

const normalizeDigits = (s: string) => s.replace(/\D/g, '');

/**
 * Lista endpoints WhatsApp ativos da org + expõe o set de números "oficiais"
 * (configurados em `organization_integrations.config_values.whatsapp_number`).
 * Threads cujo endpoint corresponde a um número oficial NÃO devem mostrar o
 * badge "via …NNNN" — somente senders secundários exibem o pill.
 */
export function useOrgWhatsAppEndpoints(organizationId: string | undefined) {
  const [endpoints, setEndpoints] = useState<OrgEndpoint[]>([]);
  const [officialNumbers, setOfficialNumbers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setEndpoints([]);
      setOfficialNumbers(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: integrationsData } = await supabase
        .from('organization_integrations')
        .select('config_values')
        .eq('organization_id', organizationId);

      const ownNumbersRaw = (integrationsData ?? [])
        .map((row: any) => row?.config_values?.whatsapp_number)
        .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);

      const ownNumbers = new Set<string>(ownNumbersRaw);
      const officialDigits = new Set<string>(
        ownNumbersRaw.map((n) => normalizeDigits(n)).filter((n) => n.length > 0),
      );

      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, display_name, provider, is_active, created_at, purpose')
        .eq('organization_id', organizationId)
        .eq('channel', 'whatsapp')
        .eq('is_active', true)
        .not('sender_sid', 'is', null)
        .neq('status', 'offline')
        .order('external_address', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn('[useOrgWhatsAppEndpoints] load failed', error.message);
        setEndpoints([]);
      } else {
        const cutoff = new Date(MIGRATION_GHOST_CUTOFF).getTime();
        const filtered = ((data ?? []) as OrgEndpoint[]).filter((ep) => {
          if (ownNumbers.has(ep.external_address)) return true;
          return new Date(ep.created_at).getTime() > cutoff;
        });
        setEndpoints(filtered);
      }
      setOfficialNumbers(officialDigits);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { endpoints, officialNumbers, loading, hasMultiple: endpoints.length >= 2 };
}
