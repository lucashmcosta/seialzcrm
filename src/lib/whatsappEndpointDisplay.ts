export interface EndpointDisplayInfo {
  id?: string | null;
  external_address?: string | null;
  provider?: string | null;
  purpose?: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  meta_cloud_api: 'Meta Cloud API',
  twilio: 'Twilio',
};

const PURPOSE_LABELS: Record<string, string> = {
  commercial: 'Comercial',
  vendor_personal: 'Vendedor pessoal',
  customer_service: 'Atendimento',
  support: 'Atendimento',
};

export function whatsappProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  return PROVIDER_LABELS[provider] ?? provider;
}

export function endpointPurposeLabel(purpose: string | null | undefined): string | null {
  if (!purpose || purpose === 'other') return null;
  return PURPOSE_LABELS[purpose] ?? purpose;
}

export function formatEndpointIdentity(endpoint: EndpointDisplayInfo | null | undefined): string | null {
  if (!endpoint) return null;
  const parts = [
    endpointPurposeLabel(endpoint.purpose),
    endpoint.external_address || null,
    whatsappProviderLabel(endpoint.provider),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function getEndpointMigrationKind(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const kind = (metadata as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : null;
}

export function isEndpointMigrationMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  const kind = getEndpointMigrationKind(metadata);
  return kind === 'endpoint_migration_meta_7020' || kind === 'endpoint_provider_migration';
}

export function formatEndpointMigrationAuditLine(
  metadata: Record<string, unknown> | null | undefined,
  currentEndpoint?: EndpointDisplayInfo | null,
): string | null {
  if (!isEndpointMigrationMetadata(metadata)) return null;

  const fromProvider = whatsappProviderLabel((metadata as { from_provider?: string })?.from_provider);
  const toProvider = whatsappProviderLabel((metadata as { to_provider?: string })?.to_provider);
  const providerMove = fromProvider && toProvider ? `${fromProvider} → ${toProvider}` : null;
  const endpointLine = formatEndpointIdentity(currentEndpoint);

  if (providerMove && endpointLine) return `${providerMove} · ${endpointLine}`;
  return providerMove || endpointLine;
}