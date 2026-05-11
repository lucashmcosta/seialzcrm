import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ChartBar, Megaphone, Funnel, ChartLine, House } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/marketing', label: 'Overview', icon: House, exact: true },
  { href: '/marketing/ads', label: 'Ads', icon: Megaphone },
  { href: '/marketing/funnel', label: 'Funil', icon: Funnel },
  { href: '/marketing/timeline', label: 'Histórico', icon: ChartLine },
];

export function MarketingLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { pathname } = useLocation();
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
