import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';
import { toLegacy } from '@/lib/permissions/convert';
import type { PermissionsV2, Scope } from '@/lib/permissions/types';

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
  canMakeCalls: boolean;
  canReceiveCalls: boolean;
  canViewAllCalls: boolean;
  canManageTelephony: boolean;
  canTransferCalls: boolean;
  // RBAC v2 (só preenchidos quando o interruptor está ligado para a org)
  rbacV2: boolean;
  v2: PermissionsV2 | null;
  canManageTeams: boolean;
  canManageCustomerService: boolean;
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
  canMakeCalls: false,
  canReceiveCalls: false,
  canViewAllCalls: false,
  canManageTelephony: false,
  canTransferCalls: false,
  rbacV2: false,
  v2: null,
  canManageTeams: false,
  canManageCustomerService: false,
};

/** Lê um caminho do modelo novo, ex.: 'dados.contatos.ver' ou 'ferramentas.importar'. */
export function permAt(v2: PermissionsV2 | null, path: string): Scope | boolean | undefined {
  if (!v2) return undefined;
  return path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), v2);
}
/** true se o caminho concede algo (bool true ou escopo diferente de 'nenhum'). Sem v2 → fallback. */
export function canV2(p: Permissions, path: string, fallback = true): boolean {
  if (!p.rbacV2) return fallback;
  const v = permAt(p.v2, path);
  return v === true || (typeof v === 'string' && v !== 'nenhum');
}

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

      // RBAC v2: com o interruptor ligado, o banco devolve as permissões efetivas
      // (perfil de sistema = tudo). As chaves antigas passam a ser derivadas delas.
      const { data: v2On } = await supabase.rpc('rbac_v2_enabled', { _org: organization!.id });
      if (v2On) {
        const { data: eff } = await supabase.rpc('my_perms_v2', { _org: organization!.id });
        if (!eff) return defaultPermissions;
        const v2 = eff as unknown as PermissionsV2;
        const l = toLegacy(v2);
        return {
          canViewContacts: !!l.can_view_contacts,
          canEditContacts: !!l.can_edit_contacts,
          canDeleteContacts: !!l.can_delete_contacts,
          canViewOpportunities: !!l.can_view_opportunities,
          canEditOpportunities: !!l.can_edit_opportunities,
          canDeleteOpportunities: !!l.can_delete_opportunities,
          canManageSettings: !!l.can_manage_settings,
          canManageUsers: !!l.can_manage_users,
          canManageBilling: !!l.can_manage_billing,
          canManageIntegrations: !!l.can_manage_integrations,
          viewAllContacts: !!l.view_all_contacts,
          viewAllOpportunities: !!l.view_all_opportunities,
          viewAllThreads: !!l.view_all_threads,
          manageAssignments: !!l.manage_assignments,
          roundRobinRecipient: !!l.round_robin_recipient,
          canMakeCalls: !!l.can_make_calls,
          canReceiveCalls: !!l.can_receive_calls,
          canViewAllCalls: !!l.can_view_all_calls,
          canManageTelephony: !!l.can_manage_telephony,
          canTransferCalls: !!l.can_transfer_calls,
          rbacV2: true,
          v2,
          canManageTeams: !!v2.administracao?.usuarios,
          canManageCustomerService: !!v2.administracao?.config_atendimento,
        };
      }

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
        canMakeCalls: perms.can_make_calls || false,
        canReceiveCalls: perms.can_receive_calls || false,
        canViewAllCalls: perms.can_view_all_calls || false,
        canManageTelephony: perms.can_manage_telephony || false,
        canTransferCalls: perms.can_transfer_calls || false,
        rbacV2: false,
        v2: null,
        canManageTeams: false,
        canManageCustomerService: perms.can_manage_settings || false,
      };
    },
  });

  return { permissions, loading };
}
