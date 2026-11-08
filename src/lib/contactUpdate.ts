// Gravação de contato compartilhada entre ContactForm e a Ficha lateral do Comercial.
// Regras puras em contactRules.ts; aqui só o que consulta o banco.
import { supabase } from '@/integrations/supabase/client';
export { cpfInputError, classifyContactDbError, type ContactDbErrorKind } from '@/lib/contactRules';

export type DuplicateContact = { id: string; full_name: string | null; email: string | null; phone: string | null };

/** Contatos com o mesmo e-mail, só quando a regra da org checa e-mail. */
export async function findEmailDuplicates(
  org: { id: string; duplicate_check_mode?: string | null },
  email: string,
  excludeContactId?: string,
): Promise<DuplicateContact[]> {
  const mode = org.duplicate_check_mode || 'none';
  if (!email || (mode !== 'email' && mode !== 'email_or_phone')) return [];
  let query = supabase
    .from('contacts')
    .select('id, full_name, email, phone')
    .eq('organization_id', org.id)
    .eq('email', email)
    .is('deleted_at', null);
  if (excludeContactId) query = query.neq('id', excludeContactId);
  const { data } = await query;
  return (data ?? []) as DuplicateContact[];
}
