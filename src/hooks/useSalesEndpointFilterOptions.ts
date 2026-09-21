import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Opção do filtro "por número" da tela Comercial.
 *
 * A chave é o NÚMERO (dígitos), não o id do endpoint: o mesmo número pode ter
 * mais de uma ficha em `communication_endpoints` (ex.: 7020 tem a ficha
 * histórica Meta, inativa, e a ficha atual Evolution). Todas as fichas do mesmo
 * número entram em `endpointIds` para o casamento.
 */
export interface SalesEndpointFilterOption {
  key: string;
  address: string;
  endpointIds: string[];
  isOfficial: boolean;
}

const normalizeDigits = (s: string) => (s || '').replace(/\D/g, '');

/**
 * Lista os números COMERCIAIS da organização para uso EXCLUSIVO do filtro da
 * lista de conversas (apresentacional). Diferente de `useOrgWhatsAppEndpoints`,
 * não exige `is_active`, `sender_sid` nem `status`, porque conversas antigas
 * podem exibir números hoje inativos ou de providers sem `sender_sid`
 * (Evolution). Nunca alimenta envio, "Responder por" ou route.
 */
export function useSalesEndpointFilterOptions(organizationId: string | undefined) {
  const [options, setOptions] = useState<SalesEndpointFilterOption[]>([]);

  useEffect(() => {
    if (!organizationId) {
      setOptions([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data: integrationsData } = await supabase
        .from('organization_integrations')
        .select('config_values')
        .eq('organization_id', organizationId);

      const officialDigits = new Set<string>(
        (integrationsData ?? [])
          .map((row: any) => row?.config_values?.whatsapp_number)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
          .map((n) => normalizeDigits(n))
          .filter((n) => n.length > 0),
      );

      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, purpose')
        .eq('organization_id', organizationId)
        .eq('channel', 'whatsapp')
        .eq('purpose', 'commercial')
        .order('external_address', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.warn('[useSalesEndpointFilterOptions] load failed', error.message);
        setOptions([]);
        return;
      }

      const byNumber = new Map<string, SalesEndpointFilterOption>();
      for (const ep of (data ?? []) as any[]) {
        const key = normalizeDigits(ep.external_address);
        if (!key) continue;
        const existing = byNumber.get(key);
        if (existing) {
          existing.endpointIds.push(ep.id);
        } else {
          byNumber.set(key, {
            key,
            address: ep.external_address,
            endpointIds: [ep.id],
            isOfficial: officialDigits.has(key),
          });
        }
      }

      const next = Array.from(byNumber.values()).sort((a, b) => {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        return a.address.localeCompare(b.address);
      });

      setOptions(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return options;
}
