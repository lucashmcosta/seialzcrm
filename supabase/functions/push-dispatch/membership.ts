// Filtro de envio: o destinatário precisa ter vínculo ATIVO na organização do job.
// O token de push não tem organização; quem decide o que chega é este filtro.
// Erro na consulta lança exceção (fail-closed: o job vai para retry, nunca é enviado).
// deno-lint-ignore no-explicit-any
export async function isActiveMember(supabase: any, userId: string, orgId: string): Promise<boolean> {
  if (!userId || !orgId) return false;
  const { data, error } = await supabase
    .from("user_organizations")
    .select("user_id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw new Error(`membership lookup failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
