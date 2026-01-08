import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  logo_size?: number;
  default_currency: string;
  default_locale: string;
  timezone: string;
  enable_companies_module: boolean;
  onboarding_step: string;
  onboarding_completed_at?: string;
  duplicate_check_mode?: 'none' | 'email' | 'phone' | 'email_or_phone';
  duplicate_enforce_block?: boolean;
  theme_primary_color?: string;
  theme_sidebar_color?: string;
  theme_dark_mode?: boolean;
}

export interface UserProfile {
  id: string;
  auth_user_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  avatar_url?: string;
  locale: string;
  timezone: string;
  is_platform_admin?: boolean;
}

export function useOrganization() {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Still loading auth - keep loading state
    if (authLoading) {
      setLoading(true);
      return;
    }

    // Auth finished but no user - reset state (logged out)
    if (!user) {
      setOrganization(null);
      setUserProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    // User exists - fetch data
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Step 1: Fetch user profile first (without inner join)
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
          setError('PROFILE_FETCH_ERROR');
          setLoading(false);
          return;
        }

        if (!profileData) {
          console.warn('User profile not found for auth_user_id:', user.id);
          setError('PROFILE_NOT_FOUND');
          setLoading(false);
          return;
        }

        setUserProfile(profileData as UserProfile);

        // Step 2: Fetch active organization membership separately
        const { data: membershipData, error: membershipError } = await supabase
          .from('user_organizations')
          .select('organization:organizations(*)')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();

        if (membershipError) {
          console.error('Error fetching organization membership:', membershipError);
          // Don't set error - user exists but has no org (valid state)
          setLoading(false);
          return;
        }

        if (membershipData?.organization) {
          setOrganization(membershipData.organization as Organization);
        } else {
          console.warn('No active organization found for user:', profileData.id);
        }
      } catch (err) {
        console.error('Error in useOrganization:', err);
        setError('UNKNOWN_ERROR');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  const locale = userProfile?.locale || organization?.default_locale || 'pt-BR';

  return {
    organization,
    userProfile,
    locale,
    loading,
    error,
    hasOrganization: !!organization,
  };
}
