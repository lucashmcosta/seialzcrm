import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapTemplateStatus, templateStatusPatch } from "../supabase/functions/_shared/meta-whatsapp/template-status.ts";

const base = { message_template_id: 1655199426044767, message_template_name: "retomada_sem_resposta", message_template_language: "pt_BR" };

Deno.test("aprovado: status, categoria definida pela Meta e sem motivo de rejeição", () => {
  const r = templateStatusPatch({ ...base, event: "APPROVED", reason: "NONE", message_template_category: "MARKETING" })!;
  assertEquals(r.name, "retomada_sem_resposta");
  assertEquals(r.language, "pt_BR");
  assertEquals(r.metaTemplateId, "1655199426044767");
  assertEquals(r.patch, { status: "approved", rejection_reason: null, category: "MARKETING" });
});

Deno.test("rejeitado guarda o motivo; NONE não é motivo", () => {
  assertEquals(templateStatusPatch({ ...base, event: "REJECTED", reason: "INVALID_FORMAT" })!.patch, { status: "rejected", rejection_reason: "INVALID_FORMAT" });
  assertEquals(templateStatusPatch({ ...base, event: "REJECTED", reason: "NONE" })!.patch, { status: "rejected", rejection_reason: null });
});

Deno.test("pausado/desativado deixa de ser enviável; reativado volta a aprovado", () => {
  assertEquals(templateStatusPatch({ ...base, event: "PAUSED" })!.patch, { status: "not_submitted" });
  assertEquals(templateStatusPatch({ ...base, event: "DISABLED" })!.patch, { status: "not_submitted" });
  assertEquals(templateStatusPatch({ ...base, event: "REINSTATED" })!.patch, { status: "approved", rejection_reason: null });
});

Deno.test("excluído sai da lista sem mudar o status", () => {
  assertEquals(templateStatusPatch({ ...base, event: "DELETED" })!.patch, { is_active: false });
});

Deno.test("FLAGGED, eventos desconhecidos e sem nome não mudam nada", () => {
  assertEquals(templateStatusPatch({ ...base, event: "FLAGGED" }), null);
  assertEquals(templateStatusPatch({ ...base, event: "SOMETHING_NEW" }), null);
  assertEquals(templateStatusPatch({ event: "APPROVED" }), null);
});

Deno.test("mapeamento da sincronização continua igual", () => {
  assertEquals(mapTemplateStatus("APPROVED"), "approved");
  assertEquals(mapTemplateStatus("REJECTED"), "rejected");
  assertEquals(mapTemplateStatus("IN_APPEAL"), "pending");
  assertEquals(mapTemplateStatus("PAUSED"), "not_submitted");
  assertEquals(mapTemplateStatus(undefined), "pending");
});
