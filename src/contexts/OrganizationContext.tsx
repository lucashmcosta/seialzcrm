import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  cs_inbox_includes_service_endpoints?: boolean;
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

interface OrganizationContextType {
  organization: Organization | null;
  userProfile: UserProfile | null;
  locale: string;
  loading: boolean;
  error: string | null;
  hasOrganization: boolean;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Step 1: Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('id, auth_user_id, full_name, first_name, last_name, email, avatar_url, locale, timezone, is_platform_admin, created_at, updated_at')
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

      // Step 2: Fetch organization membership (needs user_id from step 1)
      const { data: membershipData, error: membershipError } = await supabase
        .from('user_organizations')
        .select('organization:organizations(id, name, slug, logo_url, logo_size, default_currency, default_locale, timezone, enable_companies_module, onboarding_step, onboarding_completed_at, duplicate_check_mode, duplicate_enforce_block, theme_primary_color, theme_sidebar_color, theme_dark_mode, cs_inbox_includes_service_endpoints)')
        .eq('user_id', profileData.id)
        .eq('is_active', true)
        .maybeSingle();

      if (membershipError) {
        console.error('Error fetching organization membership:', membershipError);
        setLoading(false);
        return;
      }

      if (membershipData?.organization) {
        setOrganization(membershipData.organization as Organization);
      } else {
        console.warn('No active organization found for user:', profileData.id);
      }
    } catch (err) {
      console.error('Error in OrganizationContext:', err);
      setError('UNKNOWN_ERROR');
    } finally {
      setLoading(false);
    }
  }, [user]);

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
      setLastUserId(null);
      return;
    }

    // User exists and is the same - don't refetch (cached)
    if (user.id === lastUserId && (organization || userProfile)) {
      return;
    }

    // User changed or first load - fetch data
    setLastUserId(user.id);
    fetchData();
  }, [user, authLoading, lastUserId, organization, userProfile, fetchData]);

  const locale = userProfile?.locale || organization?.default_locale || 'pt-BR';

  const value: OrganizationContextType = {
    organization,
    userProfile,
    locale,
    loading,
    error,
    hasOrganization: !!organization,
    refetch: fetchData,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganizationContext must be used within an OrganizationProvider');
  }
  return context;
}
