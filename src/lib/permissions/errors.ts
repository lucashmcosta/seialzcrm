/** Traduz os códigos rbac_* devolvidos pelo servidor para textos em português. */
export const RBAC_MESSAGES: Record<string, string> = {
  rbac_close_denied: 'Você não tem permissão para resolver esta conversa.',
  rbac_assign_denied: 'Você não tem permissão para reatribuir esta conversa.',
  rbac_create_denied: 'Você não tem permissão para criar este registro.',
  rbac_delete_denied: 'Você não tem permissão para excluir este registro.',
  rbac_edit_denied: 'Você não tem permissão para editar este registro.',
};
export const RBAC_FALLBACK = 'Você não tem permissão para esta ação.';

/** Se o texto contém um código rbac_*, devolve a tradução; senão, null. */
export function rbacErrorMessage(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/\brbac_[a-z_]+/);
  if (!m) return null;
  return RBAC_MESSAGES[m[0]] ?? RBAC_FALLBACK;
}
