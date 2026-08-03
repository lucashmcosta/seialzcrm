// deno-lint-ignore no-explicit-any
export async function telephonyV2Enabled(
  admin: any,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await admin.from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", "telephony_v2")
    .maybeSingle();
  if (error || data?.is_enabled !== true) return false;
  const organizations = (data.organization_ids ?? []) as string[];
  return organizations.length === 0 || organizations.includes(organizationId);
}
