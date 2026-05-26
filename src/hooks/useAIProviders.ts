import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shape returned by `vw_org_provider_keys.info` (server-computed, safe).
 * Never contains plaintext or ciphertext.
 */
export interface AIProviderInfo {
  last4: string | null;
  verified_at: string | null;
  is_active: boolean;
  rotated_at: string | null;
  has_error: boolean;
  fallback_to_managed: boolean;
  fallback_on_rate_limit?: boolean;
  monthly_budget_usd: number | null;
  source?: 'customer_key' | 'managed' | null;
}

export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'elevenlabs';

export type AIProviderStatus =
  | 'not_configured'
  | 'legacy_detected'
  | 'active'
  | 'inactive'
  | 'invalid'
  | 'budget_exceeded'
  | 'managed_fallback';

export function statusOfProvider(
  info?: AIProviderInfo | null,
  hasLegacyKey?: boolean,
): AIProviderStatus {
  if (info) {
    if (info.has_error) return 'invalid';
    if (info.fallback_to_managed && info.has_error) return 'managed_fallback';
    if (!info.is_active) return 'inactive';
    if (info.verified_at) return 'active';
    return 'inactive';
  }
  if (hasLegacyKey) return 'legacy_detected';
  return 'not_configured';
}

/**
 * Slug stored in admin_integrations -> provider id used by BYOK edge functions.
 * Reads from config_schema.provider when available, falls back to slug heuristic.
 */
export function resolveProviderId(integration: any): AIProviderId | null {
  const schemaProvider = integration?.config_schema?.provider;
  if (schemaProvider) return schemaProvider as AIProviderId;
  const slug = integration?.slug as string | undefined;
  if (!slug) return null;
  if (slug === 'openai-gpt') return 'openai';
  if (slug === 'claude-ai') return 'anthropic';
  if (slug === 'google-gemini') return 'gemini';
  if (slug === 'elevenlabs') return 'elevenlabs';
  return null;
}

/**
 * Fetches BYOK info for every provider configured in the current org.
 * Uses the `vw_org_provider_keys` view — never reads raw secrets.
 */
export function useAIProviders(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['ai-providers', organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<Record<string, AIProviderInfo>> => {
      const { data, error } = await supabase
        .from('vw_org_provider_keys' as any)
        .select('provider, info')
        .eq('organization_id', organizationId!);
      if (error) throw error;
      const map: Record<string, AIProviderInfo> = {};
      for (const row of (data ?? []) as any[]) {
        if (row?.provider && row?.info) map[row.provider] = row.info as AIProviderInfo;
      }
      return map;
    },
  });
}

export function useInvalidateAIProviders() {
  const qc = useQueryClient();
  return (organizationId: string | undefined) =>
    qc.invalidateQueries({ queryKey: ['ai-providers', organizationId] });
}
