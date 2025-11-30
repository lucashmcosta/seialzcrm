import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Building2, FileText, Shield, Users, Flag, UserCheck, CreditCard, Ticket } from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin' },
  { icon: Building2, label: 'Contas', href: '/admin/organizations' },
  { icon: CreditCard, label: 'Planos', href: '/admin/plans' },
  { icon: Ticket, label: 'Cupons', href: '/admin/coupons' },
  { icon: Users, label: 'Administradores', href: '/admin/users' },
  { icon: UserCheck, label: 'Impersonations', href: '/admin/impersonations' },
  { icon: Flag, label: 'Feature Flags', href: '/admin/feature-flags' },
  { icon: FileText, label: 'Logs', href: '/admin/logs' },
  { icon: Shield, label: 'Segurança', href: '/admin/security' },
];

export function AdminSidebar() {
  const location = useLocation();

  return (
    <div className="w-64 bg-card border-r flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold text-primary">Portal Admin</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
