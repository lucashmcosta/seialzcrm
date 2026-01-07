import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
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
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchOrganizationData = async () => {
      try {
        // Single optimized query with joins
        const { data, error } = await supabase
          .from('users')
          .select(`
            *,
            user_organizations!inner (
              organization:organizations (*)
            )
          `)
          .eq('auth_user_id', user.id)
          .eq('user_organizations.is_active', true)
          .single();

        if (error) {
          console.error('Error fetching organization data:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Extract user profile (exclude the nested relation)
          const { user_organizations, ...profileData } = data;
          setUserProfile(profileData as UserProfile);

          // Extract organization from nested relation
          if (user_organizations?.[0]?.organization) {
            setOrganization(user_organizations[0].organization as Organization);
          }
        }
      } catch (error) {
        console.error('Error fetching organization:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizationData();
  }, [user]);

  const locale = userProfile?.locale || organization?.default_locale || 'pt-BR';

  return {
    organization,
    userProfile,
    locale,
    loading,
  };
}
