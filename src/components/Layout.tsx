import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Buildings,
  UsersThree,
  Briefcase,
  GearSix,
  SignOut,
  House,
  CheckSquare,
  ShieldCheck,
  Question,
  ChatCircleText,
  Phone,
  ChartLineUp,
  ChartBar,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/lib/i18n';
import { Notifications } from '@/components/Notifications';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { SidebarNavigationSimple } from '@/components/application/app-navigation/sidebar-navigation/sidebar-simple';
import { FeaturedCardProgressBar } from '@/components/application/app-navigation/base-components/featured-cards';
import type { NavItemType } from '@/components/application/app-navigation/config';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useTheme } from '@/contexts/ThemeContext';
import { SeialzSidebar, type SeialzNavGroup } from '@/components/seialz/SeialzSidebar';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { organization, userProfile, locale, loading } = useOrganization();
  const { permissions } = usePermissions();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { hasWhatsApp } = useWhatsAppIntegration();
  const { themePreset } = useTheme();

  // ═══════════════════════════════════════
  // SEIALZ LAYOUT
  // ═══════════════════════════════════════
  if (themePreset === 'seialz') {
    const principalItems: SeialzNavGroup['items'] = [
      { label: t('nav.dashboard'), href: '/dashboard', icon: House },
    ];
    if (permissions.canManageSettings) {
      principalItems.push({ label: t('nav.reports'), href: '/reports', icon: ChartLineUp });
      principalItems.push({ label: 'Marketing', href: '/marketing', icon: ChartBar });
    }
    principalItems.push(
      { label: t('nav.opportunities'), href: '/opportunities', icon: Briefcase },
      { label: t('nav.contacts'), href: '/contacts', icon: UsersThree },
      { label: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
    );
    const groups: SeialzNavGroup[] = [
      { label: 'PRINCIPAL', items: principalItems },
    ];

    // Add Companies if enabled (insert before Tasks)
    if (organization?.enable_companies_module) {
      const tasksIdx = groups[0].items.findIndex((i) => i.href === '/tasks');
      const insertAt = tasksIdx >= 0 ? tasksIdx : groups[0].items.length;
      groups[0].items.splice(insertAt, 0, {
        label: t('nav.companies'),
        href: '/companies',
        icon: Buildings,
      });
    }

    // Communication group
    const commItems: SeialzNavGroup['items'] = [];
    if (hasWhatsApp) {
      commItems.push({ label: t('nav.messages'), href: '/messages', icon: ChatCircleText });
    }
    if (commItems.length > 0) {
      groups.push({ label: 'COMUNICAÇÃO', items: commItems });
    }

    // System group
    const sysItems: SeialzNavGroup['items'] = [];
    if (permissions.canManageSettings) {
      sysItems.push({ label: t('nav.settings'), href: '/settings', icon: GearSix });
    }
    if (userProfile?.is_platform_admin) {
      sysItems.push({ label: t('nav.admin'), href: '/saas-admin', icon: ShieldCheck });
    }
    sysItems.push({ label: 'Central de Ajuda', href: '/docs', icon: Question });
    groups.push({ label: 'SISTEMA', items: sysItems });

    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        <ImpersonationBanner />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SeialzSidebar
            groups={groups}
            userProfile={userProfile}
            onSignOut={signOut}
            locale={locale}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // DEFAULT LAYOUT (unchanged)
  // ═══════════════════════════════════════

  // Build navigation items
  const navItems: NavItemType[] = [
    { label: t('nav.dashboard'), href: '/dashboard', icon: House },
  ];
  if (permissions.canManageSettings) {
    navItems.push({ label: t('nav.reports'), href: '/reports', icon: ChartLineUp });
    navItems.push({ label: 'Marketing', href: '/marketing', icon: ChartBar });
  }
  navItems.push(
    { label: t('nav.contacts'), href: '/contacts', icon: UsersThree },
    { label: t('nav.opportunities'), href: '/opportunities', icon: Briefcase },
    { label: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
  );

  // Add Companies menu if module is enabled (insert before Opportunities)
  if (organization?.enable_companies_module) {
    const oppIdx = navItems.findIndex((i) => i.href === '/opportunities');
    const insertAt = oppIdx >= 0 ? oppIdx : navItems.length;
    navItems.splice(insertAt, 0, {
      label: t('nav.companies'),
      href: '/companies',
      icon: Buildings,
    });
  }

  // Add Messages menu if WhatsApp is enabled
  if (hasWhatsApp) {
    navItems.push({ 
      label: t('nav.messages'), 
      href: '/messages', 
      icon: ChatCircleText 
    });
  }

  // Build footer items
  const footerItems: NavItemType[] = [];

  if (permissions.canManageSettings) {
    footerItems.push({ label: t('nav.settings'), href: '/settings', icon: GearSix });
  }

  if (userProfile?.is_platform_admin) {
    footerItems.push({ label: t('nav.admin'), href: '/saas-admin', icon: ShieldCheck });
  }

  footerItems.push({ label: 'Central de Ajuda', href: '/docs', icon: Question });

  // Logo section with skeleton
  const logoSize = organization?.logo_size || 40;
  const logoSection = loading ? (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-muted rounded-lg animate-pulse" />
      <div className="space-y-2">
        <div className="h-5 w-24 bg-muted rounded animate-pulse" />
        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
      </div>
    </div>
  ) : (
    <Link to="/dashboard" className="flex items-center gap-3">
      {organization?.logo_url ? (
        <img
          src={organization.logo_url}
          alt={organization.name}
          style={{ height: logoSize }}
          className="object-contain"
        />
      ) : (
        <>
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Buildings size={24} weight="light" className="text-primary-foreground" />
          </div>
          {organization && (
            <div>
              <h1 className="text-xl font-bold text-foreground">{organization.name}</h1>
            </div>
          )}
        </>
      )}
    </Link>
  );

  // User section with skeleton
  const userSection = loading ? (
    <div className="space-y-2">
      <div className="flex items-center gap-3 p-2">
        <div className="w-10 h-10 bg-muted rounded-full animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-3 w-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="h-9 w-full bg-muted rounded animate-pulse" />
    </div>
  ) : (
    <div className="space-y-2">
      <Link to="/profile" className="block">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">
              {userProfile?.full_name || user?.email || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {userProfile?.email || user?.email || ''}
            </p>
          </div>
        </div>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={signOut}
        className="w-full"
      >
        <SignOut size={16} weight="light" className="mr-2" />
        {t('auth.signOut')}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <ImpersonationBanner />

      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Sidebar */}
        <div className="absolute inset-y-0 left-0 z-40">
          <SidebarNavigationSimple
            items={navItems}
            footerItems={footerItems}
            logo={logoSection}
            userSection={userSection}
          />
        </div>

        {/* Main content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-64">
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
