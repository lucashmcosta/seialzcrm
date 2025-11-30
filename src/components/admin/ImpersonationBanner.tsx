import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState('');
  const [returnUrl, setReturnUrl] = useState('/admin/organizations');

  useEffect(() => {
    checkImpersonation();
  }, []);

  const checkImpersonation = async () => {
    const impersonationData = localStorage.getItem('admin_impersonation');
    if (impersonationData) {
      const data = JSON.parse(impersonationData);
      setIsImpersonating(true);
      setImpersonatedUser(data.userName || 'Usuário');
      setReturnUrl(data.returnUrl || '/admin/organizations');
    }
  };

  const handleExitImpersonation = async () => {
    try {
      // 1. Get return URL before clearing
      const impersonationData = localStorage.getItem('admin_impersonation');
      const savedReturnUrl = impersonationData 
        ? JSON.parse(impersonationData).returnUrl 
        : '/admin/organizations';

      // 2. Sign out impersonated user session
      await supabase.auth.signOut();

      // 3. Restore admin session
      const adminBackup = localStorage.getItem('admin_session_backup');
      if (adminBackup) {
        const { access_token, refresh_token } = JSON.parse(adminBackup);
        await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
      }

      // 4. Clean up localStorage
      localStorage.removeItem('admin_impersonation');
      localStorage.removeItem('admin_session_backup');

      // 5. Redirect to where admin was
      window.location.href = savedReturnUrl;
    } catch (error) {
      console.error('Error exiting impersonation:', error);
      // Fallback to login if restoration fails
      localStorage.removeItem('admin_impersonation');
      localStorage.removeItem('admin_session_backup');
      window.location.href = '/admin/login';
    }
  };

  if (!isImpersonating) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          Você está logado como <strong>{impersonatedUser}</strong> (Modo Admin)
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleExitImpersonation}
      >
        Sair da Sessão
      </Button>
    </div>
  );
}
