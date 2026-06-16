import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgEndpoint {
  id: string;
  external_address: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Cutoff timestamp imediatamente após o batch da migration
 * `populate_communication_endpoints_from_v2_senders` (2026-05-28 17:22:02.165649+00),
 * que populou `communication_endpoints` replicando os mesmos `whatsapp_senders`
 * em todas as orgs que compartilhavam o AccountSid Twilio — gerando duplicatas
 * fantasmas (ex.: número oficial da Viagi aparecendo também sob a CT).
 *
 * Endpoints criados ANTES deste cutoff só são exibidos se seu `external_address`
 * coincidir com o `whatsapp_number` configurado na própria org. Endpoints novos
 * (cadastrados via `twilio-whatsapp-setup` após o cutoff) passam direto.
 */
const MIGRATION_GHOST_CUTOFF = '2026-05-28T17:22:03Z';

/**
 * Lists active WhatsApp endpoints for the current organization.
 * Used by /messages to render the "Send from" selector and the
 * "via …XXXX" badge during temporary multi-number periods.
 *
 * The selector + badge only render when an org has 2+ active endpoints,
 * so single-endpoint tenants (Viagi, etc.) get the unchanged UX.
 */
export function useOrgWhatsAppEndpoints(organizationId: string | undefined) {
  const [endpoints, setEndpoints] = useState<OrgEndpoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setEndpoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1. whatsapp_numbers oficiais cadastrados nas integrações da própria org
      const { data: integrationsData } = await supabase
        .from('organization_integrations')
        .select('config_values')
        .eq('organization_id', organizationId);

      const ownNumbers = new Set<string>(
        (integrationsData ?? [])
          .map((row: any) => row?.config_values?.whatsapp_number)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
      );

      // 2. endpoints WhatsApp operacionais da org
      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, display_name, is_active, created_at')
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
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { endpoints, loading, hasMultiple: endpoints.length >= 2 };
}
