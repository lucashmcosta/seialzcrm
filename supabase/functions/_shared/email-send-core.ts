// Envio de e-mail pela conta Resend da org, usado pelas réguas (robô) e pelo e-mail avulso da oportunidade.
// Preenche marcadores, monta a moldura da marca, registra em email_messages e na linha do tempo.
// Com recebimento ligado, as respostas vão para o endereço de recebimento da org (contam como resposta).
import type { CadenceVariableContext } from "./cadence-variables.ts";
import { fillText, renderEmail, resendRequest } from "./email-resend.ts";
import { getResendAuth } from "./resend-auth.ts";

export interface ContextRef { organization_id: string; contact_id: string; opportunity_id?: string | null; owner_user_id?: string | null }

// deno-lint-ignore no-explicit-any
export async function loadVariableContext(supabase: any, p: ContextRef): Promise<CadenceVariableContext> {
  const [contact, opportunity, owner, org, custom] = await Promise.all([
    supabase.from("contacts").select("full_name, first_name, email, phone").eq("id", p.contact_id).maybeSingle(),
    p.opportunity_id
      ? supabase.from("opportunities").select("title, amount, currency").eq("id", p.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    p.owner_user_id
      ? supabase.from("users").select("full_name, first_name").eq("id", p.owner_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("organizations").select("name").eq("id", p.organization_id).maybeSingle(),
    supabase.from("custom_field_values")
      .select("record_id, value, custom_field_definitions:field_definition_id(name)")
      .eq("organization_id", p.organization_id)
      .in("record_id", [p.contact_id, p.opportunity_id].filter(Boolean) as string[]),
  ]);
  const customValues: Record<string, unknown> = {};
  // Contato primeiro, oportunidade por cima (o dado da venda vale mais).
  for (const pass of [p.contact_id, p.opportunity_id]) {
    for (const row of (custom.data ?? []) as Array<{ record_id: string; value: unknown; custom_field_definitions: { name: string } | null }>) {
      if (row.record_id === pass && row.custom_field_definitions?.name) customValues[row.custom_field_definitions.name.toLowerCase()] = row.value;
    }
  }
  return { contact: contact.data ?? {}, opportunity: opportunity.data ?? {}, owner: owner.data ?? null, org: org.data ?? {}, custom: customValues };
}

export type SendResult = { ok: true; emailId: string; subject: string } | { ok: false; status: "failed" | "skipped"; reason: string };

/** Preenche assunto e corpo. Devolve os marcadores vazios (o e-mail não deve sair incompleto). */
export function fillEmail(subject: string, body: string, ctx: CadenceVariableContext) {
  const s = fillText(subject, ctx);
  const b = fillText(body, ctx);
  return { subject: s.text.slice(0, 300), body: b.text, missing: [...new Set([...s.missing, ...b.missing])] };
}

// deno-lint-ignore no-explicit-any
export async function sendOrgEmail(supabase: any, p: ContextRef & {
  to_email: string; is_marketing: boolean; subject: string; body: string;
  template_id?: string | null; cadence_send_id?: string | null; tag: string; actor_user_id?: string | null;
}): Promise<SendResult> {
  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase.from("organization_email_settings").select("*").eq("organization_id", p.organization_id).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", p.organization_id).maybeSingle(),
  ]);
  if (!settings?.from_email || settings.status !== "connected") return { ok: false, status: "failed", reason: "e-mail da organização não conectado" };
  const apiKey = await getResendAuth(supabase, p.organization_id);
  if (!apiKey) return { ok: false, status: "failed", reason: "sem acesso à conta Resend da organização (conecte de novo)" };

  const ctx = await loadVariableContext(supabase, p);
  const filled = fillEmail(p.subject, p.body, ctx);
  if (filled.missing.length) return { ok: false, status: "skipped", reason: `variável sem valor: ${filled.missing.join(", ")}` };

  const { data: row, error: rowError } = await supabase.from("email_messages").insert({
    organization_id: p.organization_id, contact_id: p.contact_id, opportunity_id: p.opportunity_id ?? null,
    cadence_send_id: p.cadence_send_id ?? null, template_id: p.template_id ?? null, to_email: p.to_email,
    subject: filled.subject, is_marketing: p.is_marketing,
  }).select("id, unsubscribe_token").single();
  if (rowError) return { ok: false, status: "failed", reason: `registro: ${rowError.message}` };

  const unsubscribeUrl = p.is_marketing ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?t=${row.unsubscribe_token}` : null;
  const { html, text } = renderEmail({ body: filled.body, branding: { ...settings, org_name: org?.name }, unsubscribeUrl });
  const fromName = String(settings.from_name || org?.name || "").replace(/[<>"]/g, "");
  // Recebimento ligado: respostas voltam para a Resend (Seialz registra e encaminha para a equipe).
  const replyTo = settings.inbound_enabled && settings.inbound_address ? settings.inbound_address : settings.reply_to;
  const r = await resendRequest(apiKey, "POST", "/emails", {
    from: fromName ? `${fromName} <${settings.from_email}>` : settings.from_email,
    to: [p.to_email], subject: filled.subject, html, text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    tags: [{ name: "seialz", value: p.tag }],
  });
  if (!r.ok || !r.data?.id) {
    const reason = `envio: ${String(r.data?.message ?? r.status)}`.slice(0, 300);
    await supabase.from("email_messages").update({ status: "failed", error: reason }).eq("id", row.id);
    return { ok: false, status: "failed", reason };
  }
  await supabase.from("email_messages").update({ status: "sent", provider_message_id: String(r.data.id), sent_at: new Date().toISOString() }).eq("id", row.id);
  await supabase.from("activities").insert({
    organization_id: p.organization_id, contact_id: p.contact_id, opportunity_id: p.opportunity_id ?? null,
    activity_type: "message", title: `E-mail enviado: ${filled.subject.slice(0, 150)}`, body: filled.body.slice(0, 2000),
    occurred_at: new Date().toISOString(), created_by_user_id: p.actor_user_id ?? null,
  });
  return { ok: true, emailId: row.id, subject: filled.subject };
}
