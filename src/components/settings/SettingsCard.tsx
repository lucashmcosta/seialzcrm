import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface SettingsCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  badge?: string;
  badgeVariant?: 'default' | 'info' | 'warning';
  to: string;
}

export function SettingsCard({ icon: Icon, label, description, badge, badgeVariant = 'default', to }: SettingsCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        'block w-full text-left p-4 rounded-xl border border-border bg-card',
        'transition-all duration-200 group',
        'hover:border-primary/20 hover:bg-primary/5 hover:shadow-sm'
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{label}</span>
            {badge && (
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  badgeVariant === 'warning' && 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
                  badgeVariant === 'info' && 'bg-primary/10 text-primary border-primary/20',
                  badgeVariant === 'default' && 'bg-muted text-muted-foreground border-border'
                )}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
