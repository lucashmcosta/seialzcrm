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
  const { data: users } = await admin
    .from("users")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("is_active", true);
  if (!users || users.length === 0) return;
  const rows = users.map((u: any) => ({
    organization_id,
    user_id: u.id,
    ...payload,
  }));
  await admin.from("notifications").insert(rows);
}
