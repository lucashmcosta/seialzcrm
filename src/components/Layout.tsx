import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, Users, Briefcase, Settings, LogOut, LayoutDashboard, CheckSquare, Shield, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/lib/i18n';
import { Notifications } from '@/components/Notifications';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { InboundCallHandler } from '@/components/calls/InboundCallHandler';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { permissions } = usePermissions();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');

  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.contacts'), href: '/contacts', icon: Users },
    { name: t('nav.opportunities'), href: '/opportunities', icon: Briefcase },
    { name: t('nav.tasks'), href: '/tasks', icon: CheckSquare },
  ];

  // Add Companies menu if module is enabled
  if (organization?.enable_companies_module) {
    navigation.splice(2, 0, { 
      name: t('nav.companies'), 
      href: '/companies', 
      icon: Building2 
    });
  }

  // Add Settings menu if user has permission
  if (permissions.canManageSettings) {
    navigation.push({ name: t('nav.settings'), href: '/settings', icon: Settings });
  }

  if (userProfile?.is_platform_admin) {
    navigation.push({ name: t('nav.admin'), href: '/saas-admin', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <InboundCallHandler />
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Seialz</h1>
                {organization && (
                  <p className="text-xs text-muted-foreground">{organization.name}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-border">
            <Link to="/profile" className="block mb-3">
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
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
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.signOut')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        {/* Top bar with notifications */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
          <div className="px-6 py-2 flex justify-end items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" asChild>
                    <Link to="/docs">
                      <HelpCircle className="w-5 h-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Central de Ajuda</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Notifications />
          </div>
        </div>
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}