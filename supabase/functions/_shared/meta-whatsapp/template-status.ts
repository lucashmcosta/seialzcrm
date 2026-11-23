// Status de template da Meta → status do Seialz (whatsapp_templates.status).
// Usado pela sincronização (GET /message_templates) e pelo webhook message_template_status_update,
// para os dois gravarem a mesma coisa. Sem dependências de Deno (testável).

/** Status do template na listagem da Meta. */
export function mapTemplateStatus(meta: string | null | undefined): string {
  const s = String(meta ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "IN_APPEAL" || s === "PENDING_DELETION") return "pending";
  if (s === "DISABLED" || s === "PAUSED") return "not_submitted";
  return "pending";
}

export type TemplateStatusPatch = {
  name: string;
  language: string | null;
  metaTemplateId: string | null;
  /** Campos a gravar em whatsapp_templates. */
  patch: Record<string, unknown>;
};

/**
 * O que gravar no template a partir do webhook message_template_status_update.
 * Devolve null quando o evento não muda o status no Seialz:
 * - FLAGGED: só um alerta de qualidade, e o template continua enviável;
 * - LIMIT_EXCEEDED e eventos desconhecidos.
 */
export function templateStatusPatch(value: any): TemplateStatusPatch | null {
  const name = String(value?.message_template_name ?? "").trim();
  if (!name) return null;
  const event = String(value?.event ?? "").toUpperCase();
  const reasonRaw = String(value?.reason ?? "").trim();
  const reason = reasonRaw && reasonRaw.toUpperCase() !== "NONE" ? reasonRaw : null;
  const category = String(value?.message_template_category ?? "").trim().toUpperCase() || null;

  let patch: Record<string, unknown>;
  if (event === "APPROVED" || event === "REINSTATED") patch = { status: "approved", rejection_reason: null };
  else if (event === "REJECTED") patch = { status: "rejected", rejection_reason: reason };
  else if (event === "PENDING" || event === "IN_APPEAL" || event === "PENDING_DELETION") patch = { status: "pending" };
  else if (event === "DISABLED" || event === "PAUSED") patch = { status: "not_submitted" };
  else if (event === "DELETED" || event === "ARCHIVED") patch = { is_active: false };
  else return null;

  if (category) patch.category = category;
  return {
    name,
    language: value?.message_template_language ? String(value.message_template_language) : null,
    metaTemplateId: value?.message_template_id != null ? String(value.message_template_id) : null,
    patch,
  };
}
