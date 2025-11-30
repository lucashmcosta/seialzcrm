import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function ImpersonationBanner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState('');

  useEffect(() => {
    checkImpersonation();
  }, []);

  const checkImpersonation = async () => {
    // Check URL params first (from magic link)
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('imp_session');
    
    if (urlSessionId) {
      setSessionId(urlSessionId);
      localStorage.setItem('impersonation_session_id', urlSessionId);
      
      // Fetch session details
      const { data: session } = await supabase
        .from('impersonation_sessions')
        .select('target_user_name')
        .eq('id', urlSessionId)
        .single();
      
      if (session) {
        setImpersonatedUser(session.target_user_name || 'Usuário');
      }
    } else {
      // Check localStorage
      const storedSessionId = localStorage.getItem('impersonation_session_id');
      if (storedSessionId) {
        setSessionId(storedSessionId);
        
        // Fetch session details
        const { data: session } = await supabase
          .from('impersonation_sessions')
          .select('target_user_name')
          .eq('id', storedSessionId)
          .single();
        
        if (session) {
          setImpersonatedUser(session.target_user_name || 'Usuário');
        }
      }
    }
  };

  const handleEndSession = async () => {
    try {
      if (sessionId) {
        // Call edge function to end session
        await supabase.functions.invoke('admin-impersonate-end', {
          body: { sessionId },
        });
      }

      // Clean up
      localStorage.removeItem('impersonation_session_id');
      
      // Sign out impersonated user
      await supabase.auth.signOut();
      
      // Close this tab
      window.close();
    } catch (error) {
      console.error('Error ending impersonation:', error);
      // Fallback: still sign out and close
      localStorage.removeItem('impersonation_session_id');
      await supabase.auth.signOut();
      window.close();
    }
  };

  if (!sessionId) return null;

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
        onClick={handleEndSession}
      >
        Encerrar Sessão
      </Button>
    </div>
  );
}
