// Aviso de retorno da Resend (entregue, aberto, clicado, devolvido, spam...). Cada org tem a própria URL
// (?t=<token>) e o próprio segredo de assinatura; aviso sem assinatura válida é recusado.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { renderEmail, resendRequest, verifySvixSignature } from "../_shared/email-resend.ts";
import { getResendAuth } from "../_shared/resend-auth.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{32,128}$/.test(token)) return json({ error: "not_found" }, 404);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secretRow } = await supabase.from("organization_email_secrets")
    .select("organization_id, webhook_secret_encrypted").eq("webhook_token", token).maybeSingle();
  if (!secretRow?.webhook_secret_encrypted) return json({ error: "not_found" }, 404);

  const raw = await req.text();
  let secret = "";
  try { secret = await decryptSecret(secretRow.webhook_secret_encrypted); } catch { return json({ error: "secret_unavailable" }, 500); }
  const valid = await verifySvixSignature({
    secret, id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"), body: raw,
  });
  if (!valid) return json({ error: "invalid_signature" }, 401);

  let event: { type?: string; data?: Record<string, any> };
  try { event = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  const emailId = String(event.data?.email_id ?? "");
  let type = String(event.type ?? "");
  if (!emailId || !type.startsWith("email.")) return json({ ok: true, ignored: true });

  // Resposta do lead (recebimento ligado): registra, conta como resposta da régua e encaminha à equipe.
  if (type === "email.received") {
    const org = secretRow.organization_id as string;
    const token = await getResendAuth(supabase, org);
    let from = String(event.data?.from ?? "");
    let subject = String(event.data?.subject ?? "");
    let text = "";
    if (token) {
      const full = await resendRequest(token, "GET", `/emails/receiving/${emailId}`);
      if (full.ok) {
        from = String(full.data.from ?? from);
        subject = String(full.data.subject ?? subject);
        text = String(full.data.text ?? String(full.data.html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+\n/g, "\n").trim();
      }
    }
    const { data: res, error: inErr } = await supabase.rpc("fn_email_inbound", {
      p_org: org, p_provider_id: emailId, p_from: from, p_subject: subject, p_text: text.slice(0, 5000),
    });
    if (inErr) { console.error("[resend-webhook] inbound", inErr.message); return json({ error: "apply_failed" }, 500); }
    const r = res as { duplicate?: boolean; inbound_id?: string } | null;
    if (!r?.duplicate && token) {
      const { data: s } = await supabase.from("organization_email_settings").select("*").eq("organization_id", org).maybeSingle();
      const { data: o } = await supabase.from("organizations").select("name").eq("id", org).maybeSingle();
      // Nunca encaminha para o próprio endereço de recebimento (laço).
      if (s?.inbound_enabled && s.reply_to && s.from_email && s.reply_to.toLowerCase() !== String(s.inbound_address ?? '').toLowerCase()) {
        const body = `Resposta recebida de ${from}${subject ? `\nAssunto: ${subject}` : ""}\n\n${text || "(sem texto)"}`;
        const { html, text: plain } = renderEmail({ body, branding: { ...s, org_name: o?.name }, unsubscribeUrl: null });
        const fwd = await resendRequest(token, "POST", "/emails", {
          from: `${String(s.from_name || o?.name || "Seialz").replace(/[<>"]/g, "")} <${s.from_email}>`,
          to: [s.reply_to], subject: `Resposta de ${from}: ${subject}`.slice(0, 300), html, text: plain, reply_to: from,
          tags: [{ name: "seialz", value: "reply_forward" }],
        });
        if (fwd.ok && r?.inbound_id) await supabase.from("email_inbound").update({ forwarded: true }).eq("id", r.inbound_id);
      }
    }
    return json({ ok: true });
  }

  let detail: string | null = null;
  if (type === "email.bounced") {
    const b = event.data?.bounce ?? {};
    detail = [b.type, b.subType, b.message].filter(Boolean).join(": ").slice(0, 300) || null;
  } else if (type === "email.suppressed") {
    // Endereço na lista de bloqueio da Resend: vale como devolução definitiva.
    type = "email.bounced";
    detail = "Permanent: suppressed";
  } else if (type === "email.failed") {
    detail = String(event.data?.failed?.reason ?? event.data?.reason ?? "").slice(0, 300) || null;
  }

  const { error } = await supabase.rpc("fn_email_apply_event", {
    p_org: secretRow.organization_id, p_provider_id: emailId, p_type: type, p_detail: detail,
  });
  if (error) {
    console.error("[resend-webhook] apply", error.message);
    return json({ error: "apply_failed" }, 500); // a Resend tenta de novo
  }
  return json({ ok: true });
});
