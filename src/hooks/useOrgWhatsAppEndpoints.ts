import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgEndpoint {
  id: string;
  external_address: string;
  display_name: string | null;
  is_active: boolean;
}

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
    supabase
      .from('communication_endpoints')
      .select('id, external_address, display_name, is_active')
      .eq('organization_id', organizationId)
      .eq('channel', 'whatsapp')
      .eq('is_active', true)
      .order('external_address', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[useOrgWhatsAppEndpoints] load failed', error.message);
          setEndpoints([]);
        } else {
          setEndpoints((data ?? []) as OrgEndpoint[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { endpoints, loading, hasMultiple: endpoints.length >= 2 };
}
