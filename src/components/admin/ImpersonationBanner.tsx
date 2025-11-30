import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState('');

  useEffect(() => {
    checkImpersonation();
  }, []);

  const checkImpersonation = async () => {
    const impersonationData = localStorage.getItem('admin_impersonation');
    if (impersonationData) {
      const data = JSON.parse(impersonationData);
      setIsImpersonating(true);
      setImpersonatedUser(data.userName || 'Usuário');
    }
  };

  const handleExitImpersonation = async () => {
    localStorage.removeItem('admin_impersonation');
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
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
