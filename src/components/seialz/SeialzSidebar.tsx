import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { SignOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import type { ComponentType, ReactNode } from 'react';

export interface SeialzNavItem {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number | string; weight?: string; className?: string }>;
  badge?: number;
}

export interface SeialzNavGroup {
  label: string;
  items: SeialzNavItem[];
}

interface SeialzSidebarProps {
  groups: SeialzNavGroup[];
  userProfile?: { full_name?: string | null; email?: string | null } | null;
  onSignOut: () => void;
  locale?: string;
}

export function SeialzSidebar({ groups, userProfile, onSignOut, locale = 'pt-BR' }: SeialzSidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [tooltip, setTooltip] = useState<{ text: string; top: number; left: number } | null>(null);
  const location = useLocation();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');

  const initials = userProfile?.full_name
    ? userProfile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>, item: SeialzNavItem) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const text = item.badge ? `${item.label} · ${item.badge}` : item.label;
    setTooltip({ text, top: rect.top + rect.height / 2, left: rect.right + 12 });
  };

  const handleMouseLeave = () => setTooltip(null);

  return (
    <>
      <aside
        className={cn(
          'h-screen flex flex-col flex-shrink-0 border-r border-border bg-[hsl(var(--sz-bg2))] z-10 transition-[width] duration-200',
          collapsed ? 'w-[60px]' : 'w-[220px]'
        )}
      >
        {/* Logo */}
        <div
          className="h-14 flex items-center border-b border-border flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={() => { setCollapsed(!collapsed); setTooltip(null); }}
        >
          <div className="w-[60px] h-14 flex items-center justify-center flex-shrink-0">
            <div className="w-7 h-7 bg-background rounded-md flex items-center justify-center border border-[hsl(var(--sz-green-border))]">
              <span className="font-display text-[13px] text-primary">
                <span className="opacity-30 text-[10px]">[</span>s<span className="opacity-30 text-[10px]">]</span>
              </span>
            </div>
          </div>
          {!collapsed && (
            <span className="seialz-logo logo-sm logo-dark whitespace-nowrap">
              <span className="br">[</span>seialz<span className="cur">|</span><span className="br">]</span>
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className={cn(
                'mt-1 pt-1',
                gi > 0 && 'border-t border-border'
              )}
            >
              {!collapsed && (
                <div className="font-data text-[9px] text-[hsl(var(--sz-tm))] px-4 pt-2 pb-1 tracking-wider">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'relative flex items-center h-10 transition-colors duration-150',
                      isActive
                        ? 'bg-[hsl(var(--sz-green-dim))]'
                        : 'hover:bg-[hsl(var(--sz-bg3))]'
                    )}
                    onMouseEnter={(e) => handleMouseEnter(e, item)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Active bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r-sm" />
                    )}
                    {/* Icon */}
                    <div className="w-[60px] h-10 flex items-center justify-center flex-shrink-0">
                      <Icon
                        size={20}
                        weight={isActive ? 'fill' : 'light'}
                        className={cn(
                          'transition-colors',
                          isActive ? 'text-primary' : 'text-[hsl(var(--sz-t3))] group-hover:text-[hsl(var(--sz-t2))]'
                        )}
                      />
                    </div>
                    {/* Text */}
                    {!collapsed && (
                      <span
                        className={cn(
                          'text-[13px] whitespace-nowrap',
                          isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}
                      >
                        {item.label}
                      </span>
                    )}
                    {/* Badge */}
                    {!collapsed && item.badge != null && (
                      <div className="ml-auto mr-3">
                        <span className="font-data text-[10px] text-primary bg-[hsl(var(--sz-green-dim))] px-1.5 py-0.5 rounded-lg">
                          {item.badge}
                        </span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border h-14 flex items-center flex-shrink-0 overflow-hidden">
          <Link to="/profile" className="w-[60px] h-14 flex items-center justify-center flex-shrink-0">
            <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-primary to-[hsl(var(--sz-green-dark))] flex items-center justify-center">
              <span className="font-display text-[11px] text-primary-foreground font-semibold">
                {initials}
              </span>
            </div>
          </Link>
          {!collapsed && (
            <div className="flex-1 min-w-0 pr-3">
              <div className="text-xs font-medium text-foreground truncate">
                {userProfile?.full_name || 'Usuário'}
              </div>
              <div className="font-data text-[9px] text-[hsl(var(--sz-t3))] uppercase tracking-wider">
                ADMIN
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Tooltip (outside sidebar to avoid overflow) */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none bg-[hsl(var(--sz-bg4))] text-foreground text-xs font-medium px-3.5 py-1.5 rounded-md border border-[hsl(var(--sz-border2))] shadow-lg whitespace-nowrap"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: 'translateY(-50%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
}
