// Múltiplas WABAs como primeira classe.
//
// Antes, a tela Meta WhatsApp Cloud dependia de `useOrgIntegration`, que resolve
// UMA única linha de `organization_integrations` (`created_at desc limit 1`).
// Em organizações com várias WABAs (o caso real de Central Trabalhista e Viagi),
// isso ancorava a tela na conexão mais recente — e se essa conexão estivesse
// desabilitada, a seção multi-WABA inteira desaparecia, deixando as demais WABAs
// sem nenhum caminho de UI para adicionar número.
//
// Este hook retorna TODAS as conexões da integração, sem eleger uma "principal".
// Leitura apenas: nenhuma credencial, purpose, Route ou flag é alterada.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MetaWabaConnection {
  id: string;
  meta_waba_id: string | null;
  display_name: string | null;
  is_enabled: boolean | null;
  meta_credentials_id: string | null;
  connected_account: Record<string, unknown> | null;
  config_values: Record<string, unknown> | null;
  whatsapp_inbound_settings: Record<string, unknown> | null;
  created_at: string | null;
}

export function useMetaWabaConnections(
  organizationId?: string | null,
  integrationId?: string | null,
) {
  const query = useQuery({
    queryKey: ['meta-waba-connections', organizationId, integrationId],
    enabled: !!organizationId && !!integrationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select(
          'id, meta_waba_id, display_name, is_enabled, meta_credentials_id, connected_account, config_values, whatsapp_inbound_settings, created_at',
        )
        .eq('organization_id', organizationId!)
        .eq('integration_id', integrationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MetaWabaConnection[];
    },
  });

  const connections = query.data ?? [];
  const enabled = connections.filter((c) => c.is_enabled === true);

  return {
    ...query,
    connections,
    enabledConnections: enabled,
    /** Existe pelo menos uma conexão Meta habilitada nesta organização. */
    hasAnyConnected: enabled.length > 0,
  };
}
