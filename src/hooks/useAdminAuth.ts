import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  mfa_enabled: boolean;
  mfa_setup_completed_at: string | null;
}

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN') {
          setTimeout(async () => {
            await loadAdminUser(session?.user || null);
            setLoading(false);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setAdminUser(null);
          setMfaRequired(false);
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadAdminUser(session?.user || null);
    setLoading(false);
  };

  const loadAdminUser = async (authUser: User | null) => {
    setUser(authUser);
    if (!authUser) {
      setAdminUser(null);
      setMfaRequired(false);
      return;
    }

    try {
      const { data: admin, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar admin:', error);
        setAdminUser(null);
        setMfaRequired(false);
        return;
      }

      if (admin) {
        setAdminUser(admin);
        setMfaRequired(!admin.mfa_enabled);
      } else {
        setAdminUser(null);
        setMfaRequired(false);
      }
    } catch (error) {
      console.error('Erro ao carregar admin user:', error);
      setAdminUser(null);
      setMfaRequired(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  return {
    user,
    adminUser,
    loading,
    mfaRequired,
    isAuthenticated: !!user && !!adminUser,
    isAdmin: !!adminUser?.mfa_enabled,
    signOut,
  };
}
