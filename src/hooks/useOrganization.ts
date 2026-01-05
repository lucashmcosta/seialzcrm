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
        // Get user profile
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', user.id)
          .single();

        if (profile) {
          setUserProfile(profile);

          // Get user's organization membership
          const { data: membership } = await supabase
            .from('user_organizations')
            .select('organization_id')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .single();

          if (membership) {
            // Get organization details
            const { data: org } = await supabase
              .from('organizations')
              .select('*')
              .eq('id', membership.organization_id)
              .single();

            setOrganization(org);
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