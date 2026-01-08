import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building07,
  Users01,
  Briefcase01,
  Settings01,
  LogOut01,
  HomeLine,
  CheckDone01,
  Shield01,
  HelpCircle,
} from '@untitledui/icons';
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

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { permissions } = usePermissions();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');

  // Build navigation items
  const navItems: NavItemType[] = [
    { label: t('nav.dashboard'), href: '/dashboard', icon: HomeLine },
    { label: t('nav.contacts'), href: '/contacts', icon: Users01 },
    { label: t('nav.opportunities'), href: '/opportunities', icon: Briefcase01 },
    { label: t('nav.tasks'), href: '/tasks', icon: CheckDone01 },
  ];

  // Add Companies menu if module is enabled
  if (organization?.enable_companies_module) {
    navItems.splice(2, 0, { 
      label: t('nav.companies'), 
      href: '/companies', 
      icon: Building07 
    });
  }

  // Build footer items
  const footerItems: NavItemType[] = [];

  if (permissions.canManageSettings) {
    footerItems.push({ label: t('nav.settings'), href: '/settings', icon: Settings01 });
  }

  if (userProfile?.is_platform_admin) {
    footerItems.push({ label: t('nav.admin'), href: '/saas-admin', icon: Shield01 });
  }

  footerItems.push({ label: 'Central de Ajuda', href: '/docs', icon: HelpCircle });

  // Logo section
  const logoSize = organization?.logo_size || 40;
  const logoSection = (
    <Link to="/dashboard" className="flex items-center gap-3">
      {organization?.logo_url ? (
        <img
          src={organization.logo_url}
          alt={organization.name}
          style={{ height: logoSize }}
          className="object-contain"
        />
      ) : (
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
          <Building07 className="w-6 h-6 text-primary-foreground" />
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold text-foreground">Seialz</h1>
        {organization && (
          <p className="text-xs text-muted-foreground">{organization.name}</p>
        )}
      </div>
    </Link>
  );

  // User section
  const userSection = (
    <div className="space-y-2">
      <Link to="/profile" className="block">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {userProfile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{userProfile?.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{userProfile?.email}</p>
          </div>
        </div>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={signOut}
        className="w-full"
      >
        <LogOut01 className="w-4 h-4 mr-2" />
        {t('auth.signOut')}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      <ImpersonationBanner />
      
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-40">
        <SidebarNavigationSimple
          items={navItems}
          footerItems={footerItems}
          logo={logoSection}
          userSection={userSection}
          featureCard={
            <FeaturedCardProgressBar
              title="Complete seu perfil"
              description="Adicione mais informações para melhorar sua experiência"
              confirmLabel="Completar"
              progress={65}
              className="hidden lg:flex"
              onDismiss={() => {}}
              onConfirm={() => navigate('/profile')}
            />
          }
        />
      </div>

      {/* Main content */}
      <div className="pl-64 flex-1">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
