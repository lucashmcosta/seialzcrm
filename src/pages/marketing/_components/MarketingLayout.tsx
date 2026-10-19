import { useMetaSocialPublishingFlag } from '@/hooks/useMetaSocialPublishingFlag';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ChartBar, Megaphone, Funnel, ChartLine, House, InstagramLogo, PaperPlaneTilt, ChatCircle, BellRinging } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/hooks/useOrganization';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';

const BASE_TABS = [
  { href: '/marketing', label: 'Overview', icon: House, exact: true },
  { href: '/marketing/ads', label: 'Ads', icon: Megaphone },
  { href: '/marketing/organic', get label() { return uiText("Orgânico"); }, icon: InstagramLogo },
  { href: '/marketing/funnel', get label() { return uiText("Funil"); }, icon: Funnel },
  { href: '/marketing/timeline', get label() { return uiText("Histórico"); }, icon: ChartLine },
];

export function MarketingLayout({ children, title }: { children: ReactNode; title?: string }) {
  useUiLocale();
  const { pathname } = useLocation();
  const { organization } = useOrganization();
  const { enabled: publishingEnabled } = useMarketingPublishingFlag(organization?.id);

  const { enabled: socialPublishingEnabled } = useMetaSocialPublishingFlag(organization?.id);
  const TABS = [...BASE_TABS, ...(socialPublishingEnabled ? [
        { href: '/marketing/posts', label: uiText("Publicações"), icon: PaperPlaneTilt },
        { href: '/marketing/comments', label: uiText("Comentários"), icon: ChatCircle }] : []), ...(publishingEnabled ? [
        { href: '/marketing/campaigns', label: uiText("Campanhas"), icon: Megaphone },
        { href: '/marketing/webhooks', label: 'Webhooks', icon: BellRinging }] : [])];
  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <ChartBar size={24} weight="light" className="text-primary" />
            <h1 className="text-3xl font-bold">{title || 'Marketing'}</h1>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/');
            return (
              <Link
                key={t.href}
                to={t.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon size={16} weight={isActive ? 'fill' : 'light'} />
                {t.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </Layout>
  );
}
