// Aviso de retorno da Resend (entregue, aberto, clicado, devolvido, spam...). Cada org tem a própria URL
// (?t=<token>) e o próprio segredo de assinatura; aviso sem assinatura válida é recusado.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { verifySvixSignature } from "../_shared/email-resend.ts";

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
