// E-mail avulso pela oportunidade (modelo ou texto livre), pela conta Resend da org.
// preview = true só devolve o texto preenchido e os avisos (não envia).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fillEmail, loadVariableContext, sendOrgEmail } from "../_shared/email-send-core.ts";
import { opportunityForCaller } from "../_shared/user-org-access.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orgId = String(body.organization_id ?? ""), oppId = String(body.opportunity_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(oppId)) return json({ error: "invalid_params" }, 400);
  const access = await opportunityForCaller(req, orgId, oppId);
  if (!access.ok) return json({ error: access.error }, access.status);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let subject = String(body.subject ?? ""), text = String(body.body ?? ""), isMarketing = !!body.is_marketing, templateId: string | null = null;
  if (body.template_id) {
    const { data: t } = await admin.from("email_templates").select("id, subject, body, is_marketing")
      .eq("id", String(body.template_id)).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
    if (!t) return json({ error: "template_not_found" }, 404);
    subject = t.subject; text = t.body; isMarketing = t.is_marketing; templateId = t.id;
  }
  if (!subject.trim() || !text.trim()) return json({ error: "subject_and_body_required" }, 400);

  const { data: contact } = await admin.from("contacts").select("email, do_not_contact, email_invalid_at, deleted_at").eq("id", access.opp.contact_id).maybeSingle();
  const warnings: string[] = [];
  if (!contact || contact.deleted_at) warnings.push("contato não encontrado");
  else {
    if (contact.do_not_contact) warnings.push("o contato pediu para não ser contatado");
    if (!contact.email) warnings.push("o contato não tem e-mail");
    if (contact.email_invalid_at) warnings.push("o e-mail do contato está inválido (devolvido ou spam)");
  }
  if (isMarketing) {
    const { data: allowed } = await admin.rpc("fn_contact_marketing_allowed", { p_contact_id: access.opp.contact_id, p_channel: "email" });
    if (!allowed) warnings.push("é marketing e o contato não aceitou e-mail de marketing");
  }

  const ref = { organization_id: orgId, contact_id: access.opp.contact_id, opportunity_id: oppId, owner_user_id: access.opp.owner_user_id };
  if (body.preview) {
    const filled = fillEmail(subject, text, await loadVariableContext(admin, ref));
    if (filled.missing.length) warnings.push(`campos vazios: ${filled.missing.join(", ")}`);
    return json({ ok: true, to: contact?.email ?? null, subject: filled.subject, body: filled.body, warnings });
  }
  if (warnings.length) return json({ error: "blocked", warnings }, 400);
  const r = await sendOrgEmail(admin, { ...ref, to_email: contact!.email!, is_marketing: isMarketing, subject, body: text,
    template_id: templateId, tag: isMarketing ? "manual_marketing" : "manual", actor_user_id: access.userId });
  if (!r.ok) return json({ error: "send_failed", reason: r.reason }, 400);
  return json({ ok: true, email_id: r.emailId });
});
