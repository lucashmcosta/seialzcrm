// Selo único de origem: Origem + Detalhe (campanha › conjunto › anúncio). Lê a mesma atribuição do painel.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, Megaphone } from '@phosphor-icons/react';
import { Badge } from '@/components/base/badges/badges';
import { useCommercialOrigins } from '@/hooks/useCommercialOrigins';
import { commercialDb } from '@/lib/commercialOrigins';
import { detailParts, methodNote, type OriginCampaign } from '@/lib/originDisplay';

export function useEntityOrigin(entityType: 'contact' | 'opportunity', entityId: string) {
  const { orgId, enabled, origins } = useCommercialOrigins();
  const attribution = useQuery({
    queryKey: ['commercial', orgId, 'entity', entityType, entityId],
    enabled: enabled && !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from('commercial_attributions')
        .select('*').eq('organization_id', orgId!).eq('entity_type', entityType)
        .eq('entity_id', entityId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const campaignId = attribution.data?.campaign_id as string | undefined;
  const campaign = useQuery({
    queryKey: ['commercial', orgId, 'campaign', campaignId],
    enabled: !!campaignId,
    staleTime: 60000,
    queryFn: async () => {
      const { data } = await commercialDb.from('marketing_campaigns')
        .select('id,campaign_name,adset_name,ad_name,display_name').eq('id', campaignId!).maybeSingle();
      return data as (OriginCampaign & { id: string }) | null;
    },
  });
  const a = attribution.data;
  return {
    enabled,
    loading: attribution.isLoading,
    attribution: a,
    originName: origins.find((o) => o.id === a?.origin_id)?.name ?? null,
    campaign: campaign.data ?? null,
    detail: detailParts(campaign.data, a?.details?.evidence),
  };
}

export function OriginSummary({ entityType, entityId }: { entityType: 'contact' | 'opportunity'; entityId: string }) {
  const o = useEntityOrigin(entityType, entityId);
  if (!o.enabled || o.loading) return null;
  const note = methodNote(o.attribution?.method);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge color={o.originName ? 'brand' : 'gray'} size="sm">
        <Megaphone className="mr-1 h-3 w-3" weight="fill" />
        {o.originName || 'Não identificado'}
      </Badge>
      {o.detail.length > 0 && (
        <span className="inline-flex max-w-[320px] items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate" title={o.detail.join(' › ')}>{o.detail.join(' › ')}</span>
          {o.campaign?.id && (
            <Link to={`/marketing/ads/${o.campaign.id}`} className="inline-flex shrink-0 text-primary hover:underline" title="Ver anúncio">
              <ArrowSquareOut className="h-3 w-3" />
            </Link>
          )}
        </span>
      )}
      {note && <span className="text-xs text-muted-foreground">· {note}</span>}
    </div>
  );
}
