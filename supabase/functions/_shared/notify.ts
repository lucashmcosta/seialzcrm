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
