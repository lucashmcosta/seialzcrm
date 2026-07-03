// Semantic groupings for communication_endpoints.purpose used by the
// composer / outbound layer. Keep these in sync with the CHECK constraint
// on communication_endpoints (currently: commercial | customer_service |
// vendor_personal | other) — the "*_LEGACY" entries just tolerate values
// that historically appeared in the column but aren't the canonical name.

export const SALES_PURPOSES = ['commercial', 'vendor_personal'] as const;
export const CS_PURPOSES = ['customer_service', 'support', 'other'] as const;

export type SalesPurpose = (typeof SALES_PURPOSES)[number];
export type CsPurpose = (typeof CS_PURPOSES)[number];

export type ComposerIntent = 'sales' | 'customer_service';

export function purposesForIntent(intent: ComposerIntent): readonly string[] {
  return intent === 'sales' ? SALES_PURPOSES : CS_PURPOSES;
}

export function isSalesPurpose(purpose: string | null | undefined): boolean {
  if (!purpose) return false;
  return (SALES_PURPOSES as readonly string[]).includes(purpose);
}

export function isCsPurpose(purpose: string | null | undefined): boolean {
  if (!purpose) return false;
  return (CS_PURPOSES as readonly string[]).includes(purpose);
}
