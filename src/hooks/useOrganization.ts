import { useOrganizationContext, Organization, UserProfile } from '@/contexts/OrganizationContext';

// Re-export types for backward compatibility
export type { Organization, UserProfile };

// Simple wrapper around the context - all existing usages continue to work
export function useOrganization() {
  return useOrganizationContext();
}
