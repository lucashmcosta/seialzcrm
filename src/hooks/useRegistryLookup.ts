import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export type RegistryKind = 'cep' | 'cnpj' | 'cpf';

export interface RegistryLookupResult<T = Record<string, unknown>> {
  ok: boolean;
  kind: RegistryKind;
  provider?: string;
  provider_version?: string;
  cached?: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
  provider_code?: string | null;
  provider_message?: string | null;
  persisted_contact_id?: string | null;
}

export function useRegistryLookup() {
  const { organization } = useOrganization();

  const lookup = useCallback(async <T = Record<string, unknown>>(
    kind: RegistryKind,
    value: string,
    options?: { contactId?: string },
  ): Promise<RegistryLookupResult<T>> => {
    if (!organization?.id) throw new Error('organization_required');
    if (organization.operating_country_code !== 'BR') {
      throw new Error('registry_lookup_requires_br');
    }

    const { data, error } = await supabase.functions.invoke<RegistryLookupResult<T>>(
      'registry-lookup',
      { body: { organization_id: organization.id, kind, value, contact_id: options?.contactId } },
    );

    if (error) {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (context?.json) {
        try {
          const payload = await context.json() as RegistryLookupResult<T>;
          if (payload?.error) throw Object.assign(new Error(payload.error), { payload });
        } catch (parsed) {
          if (parsed instanceof Error) throw parsed;
        }
      }
      throw error;
    }
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'registry_lookup_failed'), { payload: data });
    return data;
  }, [organization?.id, organization?.operating_country_code]);

  return { lookup, isBrazil: organization?.operating_country_code === 'BR' };
}
