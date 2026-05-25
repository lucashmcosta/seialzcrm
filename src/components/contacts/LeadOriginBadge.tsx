import { Link } from 'react-router-dom';
import { Megaphone, ArrowSquareOut } from '@phosphor-icons/react';
import { Badge } from '@/components/base/badges/badges';
import { getLeadOrigin, getLeadOriginColor } from '@/lib/leadOrigin';

interface LeadOriginBadgeProps {
  contact: any;
  campaign?: {
    id: string;
    display_name?: string | null;
    ad_name?: string | null;
    adset_name?: string | null;
    campaign_name?: string | null;
  } | null;
  showLink?: boolean;
}

export function LeadOriginBadge({ contact, campaign, showLink = true }: LeadOriginBadgeProps) {
  const origin = getLeadOrigin(contact);
  const color = getLeadOriginColor(origin.kind);

  const campaignLabel =
    campaign?.display_name ||
    campaign?.ad_name ||
    campaign?.adset_name ||
    campaign?.campaign_name ||
    contact?.ad_referral_headline ||
    contact?.utm_campaign;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge color={color} size="sm">
        <Megaphone className="h-3 w-3 mr-1" weight="fill" />
        {origin.label}
      </Badge>
      {campaignLabel && (
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1 max-w-[260px] truncate">
          <span className="truncate" title={campaignLabel}>{campaignLabel}</span>
          {showLink && campaign?.id && (
            <Link
              to={`/marketing/ads/${campaign.id}`}
              className="text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
              title="Ver anúncio"
            >
              <ArrowSquareOut className="h-3 w-3" />
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
