// Autoria V2 (`requested_by`): SEMPRE derivada de signature_requests.created_by, server-side.
// Nunca do body do browser nem de quem executa o retry. Falha → não chamar a SuvSign.
export type RequestedBy = { external_user_id: string; name?: string; email: string };
export type AuthorLookup = {
  getUser: (id: string) => Promise<{ id: string; full_name: string | null; email: string | null } | null>;
  isActiveMember: (userId: string, orgId: string) => Promise<boolean>;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cut = (s: string) => s.slice(0, 200);

export async function resolveRequestedBy(
  r: { created_by: string | null; organization_id: string }, db: AuthorLookup,
): Promise<RequestedBy | null> {
  if (!r.created_by) return null;
  const u = await db.getUser(r.created_by);
  if (!u) return null;
  const email = (u.email ?? "").trim();
  if (!EMAIL.test(email) || email.length > 200) return null;
  if (!(await db.isActiveMember(u.id, r.organization_id))) return null;
  const name = (u.full_name ?? "").trim();
  return { external_user_id: cut(u.id), ...(name ? { name: cut(name) } : {}), email };
}
