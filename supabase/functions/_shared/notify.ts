// Notify all users of an organization (notifications.user_id is NOT NULL).
export async function notifyOrgUsers(
  admin: any,
  organization_id: string,
  payload: {
    type: string;
    title: string;
    body?: string;
    entity_type?: string;
    entity_id?: string;
  },
) {
  const { data: rels } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organization_id)
    .eq("is_active", true);
  if (!rels || rels.length === 0) return;
  const rows = rels.map((u: any) => ({
    organization_id,
    user_id: u.user_id,
    ...payload,
  }));
  await admin.from("notifications").insert(rows);
}

// Notifica só os administradores da org (perfil de sistema, nunca pelo nome).
export async function notifyOrgSystemAdmins(
  admin: any,
  organization_id: string,
  payload: { type: string; title: string; body?: string },
): Promise<void> {
  const { data: admins, error } = await admin
    .from("user_organizations")
    .select("user_id, permission_profiles!inner(is_system)")
    .eq("organization_id", organization_id)
    .eq("is_active", true)
    .eq("permission_profiles.is_system", true);
  if (error) {
    console.error("[notify] admins_lookup_failed", error.message);
    return;
  }
  const rows = (admins ?? []).map((a: any) => ({ organization_id, user_id: a.user_id, ...payload }));
  if (rows.length === 0) return;
  const { error: insErr } = await admin.from("notifications").insert(rows);
  if (insErr) console.error("[notify] insert_failed", insErr.message);
}
