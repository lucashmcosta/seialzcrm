import { useQuery } from '@tanstack/react-query';
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
  // Round-Robin / Privacy
  viewAllContacts: boolean;
  viewAllOpportunities: boolean;
  viewAllThreads: boolean;
  manageAssignments: boolean;
  roundRobinRecipient: boolean;
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
  viewAllContacts: false,
  viewAllOpportunities: false,
  viewAllThreads: false,
  manageAssignments: false,
  roundRobinRecipient: false,
};

export function usePermissions() {
  const { user } = useAuth();
  const { organization, userProfile } = useOrganization();

  const { data: permissions = defaultPermissions, isLoading: loading } = useQuery({
    queryKey: ['permissions', userProfile?.id, organization?.id],
    enabled: !!user && !!organization?.id && !!userProfile?.id,
    staleTime: 1000 * 60 * 10, // 10 minutes — permissions rarely change
    gcTime: 1000 * 60 * 30,
    queryFn: async (): Promise<Permissions> => {
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('permission_profile_id')
        .eq('user_id', userProfile!.id)
        .eq('organization_id', organization!.id)
        .eq('is_active', true)
        .single();

      if (!membership) return defaultPermissions;

      const { data: profile } = await supabase
        .from('permission_profiles')
        .select('permissions')
        .eq('id', membership.permission_profile_id)
        .single();

      if (!profile?.permissions) return defaultPermissions;

      const perms = profile.permissions as any;
      return {
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
        viewAllContacts: perms.view_all_contacts || false,
        viewAllOpportunities: perms.view_all_opportunities || false,
        viewAllThreads: perms.view_all_threads || false,
        manageAssignments: perms.manage_assignments || false,
        roundRobinRecipient: perms.round_robin_recipient || false,
      };
    },
  });

  return { permissions, loading };
}
