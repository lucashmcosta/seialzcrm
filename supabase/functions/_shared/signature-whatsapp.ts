import { buildMetaTemplateComponents, httpsUrl, signatureTemplateButton } from "./meta-template-components.ts";
import { dispatchWhatsAppSend } from "./dispatch-whatsapp-send.ts";
import { canUserUseReplyEndpoint } from "./reply-endpoint-selection.ts";

// O client do usuário aplica RLS antes de qualquer leitura privilegiada ou envio.
type Db = any;
type Context = {
  admin: Db; userDb: Db; me: { id: string; full_name?: string };
  loadRequest: (id: unknown) => Promise<any>;
  canManage: (org: string) => Promise<boolean>;
  getLink: (requestId: string, participantId: string) => Promise<Response>;
  json: (body: unknown, status?: number) => Response;
  dispatch?: typeof dispatchWhatsAppSend;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export function matchesSigningRecipient(participant: any, contact: any): boolean {
  if (!/^\d{8,15}$/.test(digits(contact?.phone))) return false;
  if (digits(participant.phone)) return digits(participant.phone) === digits(contact.phone);
  return !!participant.email && participant.email.trim().toLowerCase() === String(contact.email ?? "").trim().toLowerCase();
}

export async function handleSignatureWhatsApp(action: string, body: any, ctx: Context): Promise<Response> {
  const { admin, userDb, me, json } = ctx;
  const fail = (message: string, status = 409, error = "signature_whatsapp_invalid") => json({ error, message }, status);
  const r = await ctx.loadRequest(body.request_id);
  if (!r) return fail("Solicitação não encontrada.", 404);
  if (!uuid.test(body.participant_id ?? "")) return fail("Participante inválido.", 400);
  const { data: p, error: participantError } = await admin.from("signature_request_participants")
    .select("id, name, email, phone, status, signing_mode, provider_participant_id")
    .eq("request_id", r.id).eq("organization_id", r.organization_id).eq("id", body.participant_id).maybeSingle();
  if (participantError || !p) return fail("Participante não encontrado.", 404);
  if (!r.provider_operation_id || !["sent", "in_progress"].includes(r.status) || p.status === "signed" || p.signing_mode === "automatic") {
    return fail("Este participante não pode receber um link de assinatura.");
  }

  const endpointFields = "id, display_name, external_address, organization_integration_id, purpose, status";
  async function eligibleEndpoint(ep: any) {
    if (!ep || !ep.organization_integration_id || ep.status !== "online") return false;
    const { data: eligible, error } = await admin.rpc("fn_is_sales_eligible_endpoint", { _organization_id: r.organization_id, _endpoint_id: ep.id });
    return !error && eligible === true && await canUserUseReplyEndpoint(admin, { organizationId: r.organization_id, userId: me.id, endpointId: ep.id });
  }
  const settingsQuery = () => admin.from("signature_whatsapp_settings").select("organization_integration_id, template_id, header_image_url, updated_at").eq("organization_id", r.organization_id);
  const templateQuery = () => admin.from("whatsapp_templates")
    .select("id, friendly_name, body, footer, components, allowed_purposes, organization_integration_id")
    .eq("organization_id", r.organization_id).eq("provider", "meta_cloud_api").eq("status", "approved").eq("is_active", true);
  const allowedTemplate = (t: any, ep: any) => t && t.organization_integration_id === ep.organization_integration_id
    && Array.isArray(t.allowed_purposes) && t.allowed_purposes.includes(ep.purpose)
    && signatureTemplateButton(Array.isArray(t.components) ? t.components : []);

  if (action === "get_whatsapp_context") {
    const { data: endpoints, error } = await userDb.from("communication_endpoints").select(endpointFields)
      .eq("organization_id", r.organization_id).eq("provider", "meta_cloud_api").eq("channel", "whatsapp").eq("is_active", true);
    if (error) return fail("Não foi possível consultar os números de envio.", 503);
    const eligible: any[] = [];
    for (const ep of endpoints ?? []) if (await eligibleEndpoint(ep)) eligible.push(ep);
    const { data: templates, error: tError } = await templateQuery();
    const { data: settings, error: sError } = await settingsQuery();
    if (tError || sError) return fail("Não foi possível consultar a configuração de assinatura.", 503);
    const contacts = new Map<string, any>();
    if (r.contact_id) {
      const { data: c } = await userDb.from("contacts").select("id, full_name, email, phone").eq("organization_id", r.organization_id).eq("id", r.contact_id).maybeSingle();
      if (c && matchesSigningRecipient(p, c)) contacts.set(c.id, c);
    }
    if (p.email) {
      const escapedEmail = p.email.trim().replace(/[\\%_]/g, (c: string) => `\\${c}`);
      const { data: matches } = await userDb.from("contacts").select("id, full_name, email, phone").eq("organization_id", r.organization_id).ilike("email", escapedEmail).limit(20);
      for (const c of matches ?? []) if (matchesSigningRecipient(p, c)) contacts.set(c.id, c);
    }
    const { data: last } = await admin.from("signature_whatsapp_deliveries").select("id, status, created_at, message_id, thread_id, contact_id, endpoint_id")
      .eq("organization_id", r.organization_id).eq("participant_id", p.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // Um timeout pode ocorrer depois que o provider aceitou a mensagem.
    // Só libera a trava quando o histórico comprova um estado terminal.
    if (last && ["pending", "unknown"].includes(last.status)) {
      const { data: message } = await admin.from("messages").select("id, thread_id, whatsapp_status, message_threads!inner(contact_id)")
        .eq("organization_id", r.organization_id).eq("message_threads.contact_id", last.contact_id).eq("endpoint_id", last.endpoint_id)
        .eq("metadata->>signature_delivery_id", last.id).limit(1).maybeSingle();
      const status = message?.whatsapp_status === "failed" ? "failed"
        : ["sent", "delivered", "read"].includes(message?.whatsapp_status) ? "sent" : null;
      if (status) {
        const patch = { status, message_id: message.id, thread_id: message.thread_id, updated_at: new Date().toISOString() };
        const { error } = await admin.from("signature_whatsapp_deliveries").update(patch).eq("id", last.id).eq("organization_id", r.organization_id);
        if (!error) Object.assign(last, patch);
      }
    }
    const { data: lastSent } = await admin.from("signature_whatsapp_deliveries").select("id, created_at")
      .eq("organization_id", r.organization_id).eq("participant_id", p.id).eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return json({
      participant: { id: p.id, name: p.name, email: p.email }, contacts: [...contacts.values()], endpoints: eligible,
      templates: (templates ?? []).filter((t: any) => eligible.some(ep => allowedTemplate(t, ep))), settings: settings ?? [],
      can_configure: await ctx.canManage(r.organization_id), last_delivery: last ?? null, last_sent: lastSent ?? null,
    });
  }

  if (!uuid.test(body.endpoint_id ?? "")) return fail("Escolha o número de envio.", 400);
  const { data: ep } = await userDb.from("communication_endpoints").select(endpointFields)
    .eq("id", body.endpoint_id).eq("organization_id", r.organization_id).eq("provider", "meta_cloud_api").eq("channel", "whatsapp").eq("is_active", true).maybeSingle();
  if (!(await eligibleEndpoint(ep))) return fail("Número indisponível ou sem permissão para envio.", 403);

  if (action === "save_whatsapp_settings") {
    if (!(await ctx.canManage(r.organization_id))) return fail("Somente administradores podem configurar o template.", 403);
    const { data: t } = await templateQuery().eq("id", body.template_id).maybeSingle();
    const button = allowedTemplate(t, ep);
    if (!button) return fail("Escolha um template aprovado e compatível com esta conta WhatsApp.");
    let image: string | null = null;
    try { if (button.hasImage) image = httpsUrl(String(body.header_image_url ?? "").trim()); }
    catch { return fail("Informe a URL HTTPS pública da imagem do cabeçalho.", 400); }
    const { error } = await admin.from("signature_whatsapp_settings").upsert({
      organization_id: r.organization_id, organization_integration_id: ep.organization_integration_id,
      template_id: t.id, header_image_url: image, updated_by: me.id, updated_at: new Date().toISOString(),
    }, { onConflict: "organization_integration_id" });
    if (error) return fail("Não foi possível salvar a configuração.", 503);
    return json({ ok: true });
  }

  if (action !== "send_whatsapp_link") return fail("Ação desconhecida.", 400);
  if (!uuid.test(body.delivery_id ?? "") || !uuid.test(body.contact_id ?? "")) return fail("Envio inválido.", 400);
  const { data: contact } = await userDb.from("contacts").select("id, email, phone")
    .eq("id", body.contact_id).eq("organization_id", r.organization_id).maybeSingle();
  if (!contact || !matchesSigningRecipient(p, contact)) return fail("O telefone do contato não corresponde a este signatário. Confira o cadastro antes de enviar.", 403);
  const { data: setting } = await settingsQuery().eq("organization_integration_id", ep.organization_integration_id).maybeSingle();
  if (!setting || setting.updated_at !== body.settings_updated_at) return fail("A configuração mudou. Atualize a prévia antes de enviar.");
  const { data: t } = await templateQuery().eq("id", setting.template_id).maybeSingle();
  const button = allowedTemplate(t, ep);
  if (!button) return fail("O template configurado não está disponível para este número.");

  const { data: previous } = await admin.from("signature_whatsapp_deliveries").select("*")
    .eq("id", body.delivery_id).eq("organization_id", r.organization_id).maybeSingle();
  if (previous) {
    if (previous.participant_id !== p.id || previous.request_id !== r.id || previous.contact_id !== contact.id || previous.endpoint_id !== ep.id || previous.template_id !== t.id) return fail("Identificador de envio já utilizado.");
    if (previous.status === "sent") return json({ ok: true, already_sent: true, message_id: previous.message_id, thread_id: previous.thread_id });
    return fail(previous.status === "failed" ? "A tentativa falhou. Feche e abra a prévia para tentar novamente." : "Este envio está em processamento ou aguardando confirmação. Confira a conversa antes de reenviar.");
  }
  const { data: lastSent, error: lastError } = await admin.from("signature_whatsapp_deliveries").select("id")
    .eq("organization_id", r.organization_id).eq("participant_id", p.id).eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastError) return fail("Não foi possível verificar os envios anteriores.", 503);
  if (lastSent && body.resend_of !== lastSent.id) return fail("O link já foi enviado. Atualize a prévia e confirme o reenvio.");

  // Resolve no servidor e somente no clique final; nunca devolve o token à prévia.
  const linkResponse = await ctx.getLink(r.id, p.id);
  if (!linkResponse.ok) return linkResponse;
  const link = await linkResponse.json();
  try {
    buildMetaTemplateComponents(t.components, { headerImageUrl: setting.header_image_url ?? undefined, buttonUrls: { [button.index]: link.signing_url } });
  } catch { return fail("O link ou a imagem não correspondem ao template configurado."); }

  const { error: claimError } = await admin.from("signature_whatsapp_deliveries").insert({
    id: body.delivery_id, organization_id: r.organization_id, request_id: r.id, participant_id: p.id,
    contact_id: contact.id, endpoint_id: ep.id, template_id: t.id, created_by: me.id,
  });
  if (claimError) return fail("Já existe uma tentativa em andamento. Atualize a prévia e confira a conversa.");
  // Revalida DEPOIS da trava: outra tentativa pode ter terminado durante a busca do link.
  const { data: completed, error: completedError } = await admin.from("signature_whatsapp_deliveries").select("id")
    .eq("organization_id", r.organization_id).eq("participant_id", p.id).eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (completedError || (completed && completed.id !== body.resend_of)) {
    await admin.from("signature_whatsapp_deliveries").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", body.delivery_id);
    return fail("Outro envio foi concluído. Atualize a prévia antes de reenviar.");
  }
  let attempted = false;
  try {
    attempted = true;
    // Sem threadId: o provider reutiliza/cria a conversa deste contato + número.
    // endpointId explícito impede a seleção de outro número por fallback.
    const result = await (ctx.dispatch ?? dispatchWhatsAppSend)({
      organizationId: r.organization_id, contactId: contact.id, endpointId: ep.id,
      templateId: t.id, templateHeaderImageUrl: setting.header_image_url ?? undefined,
      templateButtonUrls: { [button.index]: link.signing_url }, sensitiveTemplate: true,
      signatureDeliveryId: body.delivery_id,
      userId: me.id, senderName: me.full_name, senderContext: "signature",
    }, { supabase: admin });
    if (result.error || !result.data?.success) {
      // Sem prova de recusa (timeout/5xx), não repetir automaticamente.
      const definitive = !!result.error?.details && !["meta_send_failed", "internal_error"].includes(result.error.details.error);
      await admin.from("signature_whatsapp_deliveries").update({ status: definitive ? "failed" : "unknown", updated_at: new Date().toISOString() }).eq("id", body.delivery_id);
      return fail(definitive ? (result.error?.details?.message || "Envio recusado. Confira a configuração e a conversa.") : "Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente.", 502);
    }
    const { error: saveError } = await admin.from("signature_whatsapp_deliveries").update({
      status: "sent", message_id: result.data.messageId, thread_id: result.data.threadId, updated_at: new Date().toISOString(),
    }).eq("id", body.delivery_id);
    if (saveError) return fail("Mensagem aceita pelo WhatsApp, mas o registro está pendente. Confira a conversa; não repita o envio.", 503);
    return json({ ok: true, message_id: result.data.messageId, thread_id: result.data.threadId });
  } catch {
    await admin.from("signature_whatsapp_deliveries").update({ status: attempted ? "unknown" : "failed", updated_at: new Date().toISOString() }).eq("id", body.delivery_id);
    return fail("Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente.", 502);
  }
}
