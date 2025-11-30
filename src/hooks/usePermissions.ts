import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export interface Permissions {
  canViewContacts: boolean;
  canEditContacts: boolean;
  canDeleteContacts: boolean;
  canViewOpportunities: boolean;
  canEditOpportunities: boolean;
  canDeleteOpportunities: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
  canManageBilling: boolean;
  canManageIntegrations: boolean;
}

const defaultPermissions: Permissions = {
  canViewContacts: false,
  canEditContacts: false,
  canDeleteContacts: false,
  canViewOpportunities: false,
  canEditOpportunities: false,
  canDeleteOpportunities: false,
  canManageSettings: false,
  canManageUsers: false,
  canManageBilling: false,
  canManageIntegrations: false,
};

export function usePermissions() {
  const { user } = useAuth();
  const { organization, userProfile } = useOrganization();
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !organization || !userProfile) {
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        // Get user's organization membership
        const { data: membership } = await supabase
          .from('user_organizations')
          .select('permission_profile_id')
          .eq('user_id', userProfile.id)
          .eq('organization_id', organization.id)
          .eq('is_active', true)
          .single();

        if (!membership) {
          setLoading(false);
          return;
        }

        // Get permission profile
        const { data: profile } = await supabase
          .from('permission_profiles')
          .select('permissions')
          .eq('id', membership.permission_profile_id)
          .single();

        if (profile?.permissions) {
          const perms = profile.permissions as any;
          setPermissions({
            canViewContacts: perms.can_view_contacts || false,
            canEditContacts: perms.can_edit_contacts || false,
            canDeleteContacts: perms.can_delete_contacts || false,
            canViewOpportunities: perms.can_view_opportunities || false,
            canEditOpportunities: perms.can_edit_opportunities || false,
            canDeleteOpportunities: perms.can_delete_opportunities || false,
            canManageSettings: perms.can_manage_settings || false,
            canManageUsers: perms.can_manage_users || false,
            canManageBilling: perms.can_manage_billing || false,
            canManageIntegrations: perms.can_manage_integrations || false,
          });
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user, organization, userProfile]);

  return {
    permissions,
    loading,
  };
}
