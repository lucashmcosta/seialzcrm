// "Não contatar" (contacts.do_not_contact) para o contato PROATIVO automático:
// retomada, mensagem agendada, aviso. Não se aplica à resposta a quem escreveu.

export type ProactiveCheck = "allowed" | "blocked" | "unknown";

/**
 * - blocked: o contato pediu para não ser contatado (ou não existe mais).
 * - unknown: não foi possível ler o contato. Quem chama NÃO envia e tenta de novo
 *   depois; na dúvida, não se contata.
 */
export function proactiveCheckFromRow(
  row: { do_not_contact?: boolean | null; deleted_at?: string | null } | null | undefined,
  hadError: boolean,
): ProactiveCheck {
  if (hadError) return "unknown";
  if (!row || row.deleted_at) return "blocked";
  return row.do_not_contact === true ? "blocked" : "allowed";
}

// deno-lint-ignore no-explicit-any
export async function checkProactiveContact(supabase: any, organizationId: string, contactId: string | null | undefined): Promise<ProactiveCheck> {
  if (!contactId) return "blocked";
  const { data, error } = await supabase.from("contacts")
    .select("do_not_contact, deleted_at")
    .eq("id", contactId).eq("organization_id", organizationId).maybeSingle();
  return proactiveCheckFromRow(data, !!error);
}

export const DO_NOT_CONTACT_REASON = "contato pediu para não ser contatado";
