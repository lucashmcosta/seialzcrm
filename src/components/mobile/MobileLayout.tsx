import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SeialzLogo } from '@/components/SeialzLogo';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useTranslation } from '@/lib/i18n';
import {
  House,
  UsersThree,
  Briefcase,
  CheckSquare,
  ChatCircleText,
  Headset,
  List,
  X,
  Bell,
  SignOut,
  GearSix,
  Buildings,
  ShieldCheck,
  Question,
  ChartLineUp,
} from '@phosphor-icons/react';

interface MobileLayoutProps {
  children: ReactNode;
  hideBottomBar?: boolean;
}

interface MobileTab {
  label: string;
  href: string;
  icon: typeof House;
}

export function MobileLayout({ children, hideBottomBar = false }: MobileLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { permissions } = usePermissions();
  const { hasWhatsApp } = useWhatsAppIntegration();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');

  const initials = userProfile?.full_name
    ? userProfile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  // Bottom tabs
  const tabs: MobileTab[] = [
    { label: t('nav.dashboard'), href: '/dashboard', icon: House },
    { label: t('nav.contacts'), href: '/contacts', icon: UsersThree },
    { label: t('nav.opportunities'), href: '/opportunities', icon: Briefcase },
    { label: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
  ];

  if (hasWhatsApp) {
    tabs.push({ label: t('nav.messages'), href: '/messages', icon: ChatCircleText });
    tabs.push({ label: 'Atendimento', href: '/inbox', icon: Headset });
  }

  // Drawer nav items (full menu)
  const drawerItems = [
    { label: t('nav.dashboard'), href: '/dashboard', icon: House },
    { label: t('nav.contacts'), href: '/contacts', icon: UsersThree },
    { label: t('nav.opportunities'), href: '/opportunities', icon: Briefcase },
    { label: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
  ];

  if (organization?.enable_companies_module) {
    drawerItems.push({ label: t('nav.companies'), href: '/companies', icon: Buildings });
  }
  if (hasWhatsApp) {
    drawerItems.push({ label: t('nav.messages'), href: '/messages', icon: ChatCircleText });
    drawerItems.push({ label: 'Atendimento', href: '/inbox', icon: Headset });
  }

  const systemItems: { label: string; href: string; icon: typeof House }[] = [];
  if (permissions.canManageSettings) {
    systemItems.push({ label: 'Relatórios', href: '/reports', icon: ChartLineUp });
  }
  if (permissions.canManageSettings) {
    systemItems.push({ label: t('nav.settings'), href: '/settings', icon: GearSix });
  }
  if (userProfile?.is_platform_admin) {
    systemItems.push({ label: t('nav.admin'), href: '/saas-admin', icon: ShieldCheck });
  }
  systemItems.push({ label: 'Central de Ajuda', href: '/docs', icon: Question });

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: 'var(--app-height, 100dvh)' }}>
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-4 border-b border-border bg-card flex-shrink-0 z-30"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(56px + env(safe-area-inset-top, 0px))' }}
      >
        <SeialzLogo size="sm" theme="dark" animated={true} />
        <div className="flex items-center gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <Bell size={20} weight="light" />
          </button>
          <button
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setDrawerOpen(true)}
          >
            <List size={22} weight="bold" />
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* ── Bottom Tab Bar ── */}
      {!hideBottomBar && (
        <nav
          className="flex items-stretch border-t border-border bg-card flex-shrink-0 z-30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                style={{ minHeight: '56px' }}
              >
                <tab.icon size={22} weight={active ? 'fill' : 'light'} />
                <span className="text-[9px] font-medium leading-none truncate max-w-full px-0.5">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* ── Drawer Overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Drawer ── */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full w-[280px] bg-card border-l border-border z-50 flex flex-col',
          'transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {userProfile?.full_name || 'Usuário'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {organization?.name || ''}
              </p>
            </div>
          </div>
          <button
            className="p-2 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Drawer nav */}
        <div className="flex-1 overflow-auto py-3">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Principal</span>
          </div>
          {drawerItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <item.icon size={18} weight={active ? 'fill' : 'light'} />
                {item.label}
              </Link>
            );
          })}

          {systemItems.length > 0 && (
            <>
              <div className="px-3 mt-4 mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Sistema</span>
              </div>
              {systemItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                      active
                        ? 'text-primary bg-primary/10'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon size={18} weight={active ? 'fill' : 'light'} />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </div>

        {/* Sign out */}
        <div className="border-t border-border p-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => { signOut(); setDrawerOpen(false); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <SignOut size={18} weight="bold" />
            Sair
          </button>
        </div>
      </aside>
    </div>
  );
}
