// Envia mensagem WhatsApp via Meta Cloud API.
// Shape de entrada/saída compatível com twilio-whatsapp-send para uso pelo dispatcher.
// Suporta texto, image, audio, video, document dentro da janela 24h.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  metaWaPostJson,
  metaWaUploadMedia,
  MetaWaGraphError,
} from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";
import { ensureEndpointMigrationNote } from "../_shared/endpoint-migration-note.ts";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type MediaKind = "image" | "audio" | "video" | "document";
const SUPPORTED_MEDIA: MediaKind[] = ["image", "audio", "video", "document"];

function inferMimeType(mediaType: string, sourceUrl?: string, headerCt?: string | null): string {
  if (headerCt && headerCt.includes("/") && !headerCt.startsWith("application/octet-stream")) {
    return headerCt.split(";")[0].trim();
  }
  const ext = (sourceUrl || "").toLowerCase().split("?")[0].split("#")[0].split(".").pop() || "";
  const map: Record<string, string> = {
    ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
    mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", amr: "audio/amr",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp4: "video/mp4", "3gp": "video/3gpp", "3gpp": "video/3gpp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
  };
  if (map[ext]) return map[ext];
  switch (mediaType) {
    case "audio": return "audio/ogg";
    case "image": return "image/jpeg";
    case "video": return "video/mp4";
    case "document": return "application/pdf";
  }
  return "application/octet-stream";
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").pop() || "";
    if (tail) return decodeURIComponent(tail);
  } catch { /* ignore */ }
  return fallback;
}

function placeholderForMedia(kind: MediaKind): string {
  switch (kind) {
    case "audio": return "[Áudio]";
    case "image": return "[Imagem]";
    case "video": return "[Vídeo]";
    case "document": return "[Documento]";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { error: "invalid_json" });

    const {
      organizationId, contactId, threadId, message,
      mediaUrl, mediaUrls, mediaType, mimeType: payloadMime, filename: payloadFilename,
      userId, replyToMessageId, isAgentMessage, agentId, senderName,
      endpointId: explicitEndpointId,
      templateId, templateVariables,
      type: payloadType, templateName: directTemplateName,
      languageCode: directLanguageCode, components: directComponents,
      migrationContext,
      senderContext,
    } = body as Record<string, any>;

    if (!organizationId) return jsonResponse(400, { error: "missing_organization" });
    if (!contactId) return jsonResponse(400, { error: "missing_contact" });

    const isTemplateSend = !!templateId || payloadType === "template";

    // Normaliza mídia
    const mediaUrlsArr: string[] = Array.isArray(mediaUrls) && mediaUrls.length
      ? mediaUrls.filter((u: any) => typeof u === "string" && u)
      : (typeof mediaUrl === "string" && mediaUrl ? [mediaUrl] : []);
    const hasMedia = !isTemplateSend && (mediaUrlsArr.length > 0 || !!mediaType);
    const trimmedMessage = typeof message === "string" ? message : "";

    if (isTemplateSend) {
      // Validação leve aqui — restante após carregar o template do banco.
      if (!templateId && (!directTemplateName || !directLanguageCode)) {
        return jsonResponse(400, { error: "missing_template_payload" });
      }
    } else if (hasMedia) {
      if (mediaType === "sticker") {
        return jsonResponse(400, {
          error: "sticker_not_supported_yet",
          details: "Envio de sticker via Meta Cloud ainda não está habilitado.",
        });
      }
      if (!mediaType || !SUPPORTED_MEDIA.includes(mediaType as MediaKind)) {
        return jsonResponse(400, {
          error: "unsupported_media_type",
          details: "Tipos suportados: image, audio, video, document.",
        });
      }
      if (mediaUrlsArr.length === 0) {
        return jsonResponse(400, { error: "missing_media_url" });
      }
      if (trimmedMessage.length > 1024) {
        return jsonResponse(400, { error: "caption_too_long", max: 1024 });
      }
    } else {
      if (!trimmedMessage.trim()) {
        return jsonResponse(400, { error: "empty_message", details: "Digite uma mensagem antes de enviar." });
      }
      if (trimmedMessage.length > 4096) {
        return jsonResponse(400, { error: "message_too_long", max: 4096 });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve endpoint (provider='meta-cloud')
    let endpoint: any = null;
    if (explicitEndpointId) {
      const { data } = await supabase
        .from("communication_endpoints")
        .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active, purpose")
        .eq("id", explicitEndpointId)
        .maybeSingle();
      endpoint = data;
    } else if (threadId) {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id")
        .eq("id", threadId)
        .maybeSingle();
      if (thread?.primary_endpoint_id) {
        const { data: ep } = await supabase
          .from("communication_endpoints")
          .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active, purpose")
          .eq("id", thread.primary_endpoint_id)
          .maybeSingle();
        endpoint = ep;
      }
    }
    if (!endpoint) {
      // Fallback purpose-aware: escolhe endpoint cuja purpose case com o senderContext.
      // - senderContext='inbox'    → customer_service (default geral também é customer_service)
      // - senderContext='messages' → commercial
      const desiredPurpose: string =
        senderContext === "messages" ? "commercial" : "customer_service";

      const { data: candidates } = await supabase
        .from("communication_endpoints")
        .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active, purpose, status, created_at")
        .eq("organization_id", organizationId)
        .eq("provider", "meta_cloud_api")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      const rows = (candidates ?? []) as any[];
      // Tie-break determinístico:
      // 1) purpose === desiredPurpose
      // 2) status === 'online'
      // 3) created_at ASC (mais antigo primeiro)
      const score = (r: any) => {
        let s = 0;
        if (r.purpose === desiredPurpose) s += 100;
        if (r.status === "online") s += 10;
        return s;
      };
      rows.sort((a, b) => {
        const ds = score(b) - score(a);
        if (ds !== 0) return ds;
        return String(a.created_at).localeCompare(String(b.created_at));
      });
      endpoint = rows[0] ?? null;
      if (endpoint) {
        console.log("[meta-wa-send] fallback endpoint", {
          desiredPurpose,
          chosen_id: endpoint.id,
          chosen_purpose: endpoint.purpose,
          chosen_status: endpoint.status,
          candidates: rows.length,
        });
      }
    }
    if (!endpoint) return jsonResponse(400, { error: "no_meta_cloud_endpoint" });
    if (endpoint.organization_id !== organizationId) {
      return jsonResponse(403, { error: "endpoint_org_mismatch" });
    }
    if (endpoint.provider !== "meta_cloud_api") {
      return jsonResponse(400, { error: "endpoint_not_meta_cloud" });
    }
    if (!endpoint.sender_sid) return jsonResponse(400, { error: "missing_phone_number_id" });

    // Busca integration credentials
    const { data: oi } = await supabase
      .from("organization_integrations")
      .select("connected_account, config_values")
      .eq("id", endpoint.organization_integration_id)
      .maybeSingle();
    if (!oi) return jsonResponse(400, { error: "integration_not_found" });
    const ca = oi.connected_account as any;
    if (!ca?.access_token_encrypted) return jsonResponse(400, { error: "missing_access_token" });

    const decryptedAccessToken = await decryptSecret(ca.access_token_encrypted);
    // App Secret per-integration (fallback global durante Fase 1).
    const resolvedAppSecret = await resolveAppSecretForIntegration(ca);
    const accessToken = decryptedAccessToken.trim();
    const appSecret = resolvedAppSecret;

    // Contato + telefone
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone, full_name")
      .eq("id", contactId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!contact?.phone) return jsonResponse(404, { error: "contact_phone_missing" });

    // Formato E.164 sem '+'
    let to = String(contact.phone).replace(/[^\d+]/g, "");
    if (to.startsWith("+")) to = to.slice(1);
    if (!/^\d{8,15}$/.test(to)) return jsonResponse(400, { error: "invalid_contact_phone" });

    // Janela 24h
    let currentThreadId = threadId as string | undefined;
    let in24h = false;
    if (currentThreadId) {
      const { data: t } = await supabase
        .from("message_threads")
        .select("whatsapp_last_inbound_at")
        .eq("id", currentThreadId)
        .maybeSingle();
      if (t?.whatsapp_last_inbound_at) {
        in24h = (Date.now() - new Date(t.whatsapp_last_inbound_at).getTime()) / 3.6e6 < 24;
      }
    } else {
      // P1 fix (2026-07-03): antes reusava qualquer thread por (org,contact,channel),
      // sem filtrar `primary_endpoint_id`, sem excluir losers consolidados e sem
      // reabrir threads `resolved`/`closed` — o que fazia o fluxo de template
      // criar thread nova a cada envio quando a existente estava resolvida.
      // Agora:
      //   1. exige match por primary_endpoint_id (quando temos o endpoint resolvido)
      //   2. exclui losers (merged_into_thread_id IS NULL)
      //   3. inclui resolved/closed e reabre
      //   4. só cria nova se nada existir
      let existingQuery = supabase
        .from("message_threads")
        .select("id, whatsapp_last_inbound_at, status")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("channel", "whatsapp")
        .is("merged_into_thread_id", null)
        .eq("primary_endpoint_id", endpoint.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const { data: existing } = await existingQuery.maybeSingle();
      if (existing) {
        currentThreadId = existing.id;
        if (existing.whatsapp_last_inbound_at) {
          in24h = (Date.now() - new Date(existing.whatsapp_last_inbound_at).getTime()) / 3.6e6 < 24;
        }
        if (existing.status === "resolved" || existing.status === "closed") {
          const { error: reopenErr } = await supabase
            .from("message_threads")
            .update({ status: "open", resolved_at: null })
            .eq("id", existing.id);
          if (reopenErr) {
            console.warn("[meta-wa-send] thread_reopen_failed", {
              threadId: existing.id,
              err: reopenErr.message,
            });
          } else {
            console.log("[meta-wa-send] thread_reopened", { threadId: existing.id });
          }
        }
      } else {
        const { data: created, error: tErr } = await supabase
          .from("message_threads")
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            channel: "whatsapp",
            subject: "WhatsApp",
            primary_endpoint_id: endpoint.id,
          })
          .select("id")
          .single();
        if (tErr || !created) return jsonResponse(500, { error: "thread_create_failed", details: tErr?.message });
        currentThreadId = created.id;
      }
    }

    // Fora da janela 24h só permite envio de template
    if (!in24h && !isTemplateSend) {
      return jsonResponse(400, {
        error: "outside_24h_window",
        requiresTemplate: true,
        isIn24hWindow: false,
        message: "Fora da janela de 24h. Use um template aprovado.",
      });
    }

    // === Template: carrega do banco e monta payload ===
    let templateRow: any = null;
    let templateName: string | null = directTemplateName || null;
    let templateLanguage: string | null = directLanguageCode || null;
    let templateComponentsTemplate: any[] = Array.isArray(directComponents) ? directComponents : [];
    let templateBodyText: string | null = null;
    if (isTemplateSend && templateId) {
      const { data: tpl, error: tplErr } = await supabase
        .from("whatsapp_templates")
        .select("id, organization_id, provider, status, meta_template_name, language, body, components, friendly_name, allowed_purposes")
        .eq("id", templateId)
        .maybeSingle();
      if (tplErr || !tpl) return jsonResponse(404, { error: "template_not_found" });
      if (tpl.organization_id !== organizationId) return jsonResponse(403, { error: "template_org_mismatch" });
      if (tpl.provider !== "meta_cloud_api") return jsonResponse(400, { error: "template_not_meta_cloud" });
      if (tpl.status !== "approved") return jsonResponse(400, { error: "template_not_approved" });

      // PR3: purpose guard — bloqueia envio se o purpose do endpoint não estiver em allowed_purposes.
      const allowedPurposes: string[] = Array.isArray((tpl as any).allowed_purposes)
        ? ((tpl as any).allowed_purposes as string[])
        : [];
      const endpointPurpose: string | null = (endpoint as any).purpose ?? null;
      const purposeAllowed =
        !!endpointPurpose &&
        allowedPurposes.length > 0 &&
        allowedPurposes.includes(endpointPurpose);
      if (!purposeAllowed) {
        console.warn("[meta-wa-send] template_purpose_mismatch", {
          endpointId: endpoint.id,
          endpointPurpose,
          templateId: tpl.id,
          templateName: tpl.meta_template_name,
          allowedPurposes,
        });
        try {
          await supabase.from("compliance_blocks").insert({
            organization_id: organizationId,
            endpoint_id: endpoint.id,
            thread_id: currentThreadId ?? null,
            contact_id: contactId,
            template_id: tpl.id,
            template_name: tpl.meta_template_name ?? tpl.friendly_name ?? null,
            block_reason: "template_purpose_mismatch",
            source_component: "meta-whatsapp-send",
            window_state: {
              endpoint_purpose: endpointPurpose,
              allowed_purposes: allowedPurposes,
            } as any,
          });
        } catch (e) {
          console.warn("[meta-wa-send] compliance_blocks insert failed", (e as Error).message);
        }
        return jsonResponse(403, {
          error: "template_purpose_mismatch",
          details: `Template '${tpl.meta_template_name ?? tpl.friendly_name}' não é permitido para endpoints do tipo '${endpointPurpose ?? "?"}'.`,
          endpointPurpose,
          allowedPurposes,
        });
      }

      templateRow = tpl;
      templateName = tpl.meta_template_name || tpl.friendly_name;
      templateLanguage = tpl.language;
      templateComponentsTemplate = Array.isArray(tpl.components) ? tpl.components : [];
      templateBodyText = tpl.body || null;
    }

    // Renderiza preview e components finais (apenas BODY com variáveis simples).
    let renderedPreview: string | null = null;
    let outboundTemplateComponents: any[] = [];
    if (isTemplateSend) {
      // Se chamado em modo "direto", usa components vindos do caller sem alteração.
      if (!templateRow && Array.isArray(directComponents) && directComponents.length > 0) {
        outboundTemplateComponents = directComponents;
      } else {
        const bodyComp = templateComponentsTemplate.find(
          (c) => (c?.type || "").toUpperCase() === "BODY",
        );
        const bodyTextRaw = (bodyComp?.text as string | undefined) || templateBodyText || "";
        const vars = Array.from(
          new Set((bodyTextRaw.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, ""))),
        ).sort((a, b) => parseInt(a) - parseInt(b));
        const values: Record<string, string> = {};
        const tv = (templateVariables ?? {}) as Record<string, unknown>;
        for (const n of vars) {
          const v = tv[n] ?? tv[`var${n}`] ?? "";
          values[n] = String(v);
        }
        // Render preview
        let preview = bodyTextRaw;
        for (const n of vars) {
          preview = preview.split(`{{${n}}}`).join(values[n] || `{{${n}}}`);
        }
        renderedPreview = preview;
        if (vars.length > 0) {
          outboundTemplateComponents = [{
            type: "body",
            parameters: vars.map((n) => ({ type: "text", text: values[n] || "" })),
          }];
        } else {
          outboundTemplateComponents = [];
        }
      }
    }



    // Insere mensagem com status sending
    let resolvedSenderName = senderName || null;
    if (!resolvedSenderName && userId && !isAgentMessage) {
      const { data: u } = await supabase.from("users").select("full_name").eq("id", userId).maybeSingle();
      resolvedSenderName = u?.full_name || null;
    }

    const kind = (hasMedia ? mediaType : null) as MediaKind | null;
    const initialContent = isTemplateSend
      ? (renderedPreview || `[Template: ${templateName ?? "?"}]`)
      : hasMedia
        ? (trimmedMessage.trim() || placeholderForMedia(kind!))
        : trimmedMessage;

    const baseMeta: Record<string, any> = { phone_number_id: endpoint.sender_sid, to };
    if (hasMedia) {
      baseMeta.media_source_url = mediaUrlsArr[0];
      baseMeta.media_kind = kind;
    }
    if (isTemplateSend) {
      baseMeta.template = {
        name: templateName,
        language: templateLanguage,
        components: outboundTemplateComponents,
        rendered_preview: renderedPreview,
        template_id: templateRow?.id ?? null,
      };
    }

    // Timestamps coordenados: nota de migração precede o template em 1s
    // para garantir ordenação cronológica correta na UI.
    const sendTimestamp = new Date();
    const templateSentAt = sendTimestamp.toISOString();
    const migrationNoteAt = new Date(sendTimestamp.getTime() - 1000).toISOString();

    // Lazy: insere uma única nota de sistema quando este for o primeiro outbound
    // após uma migração de provider deste endpoint. No-op para threads novas ou
    // endpoints que nunca foram migrados. Nunca lança.
    if (currentThreadId) {
      await ensureEndpointMigrationNote(supabase, currentThreadId, endpoint.id, {
        noteTimestamp: migrationNoteAt,
      });
    }


    const { data: insertedMsg, error: insErr } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        thread_id: currentThreadId,
        content: initialContent,
        direction: "outbound",
        sender_user_id: userId || null,
        whatsapp_status: "sending",
        sent_at: templateSentAt,
        reply_to_message_id: replyToMessageId || null,
        sender_type: isAgentMessage ? "agent" : "user",
        sender_name: resolvedSenderName,
        sender_agent_id: isAgentMessage && agentId ? agentId : null,
        endpoint_id: endpoint.id,
        media_urls: hasMedia ? mediaUrlsArr : null,
        media_type: hasMedia ? kind : null,
        template_id: templateRow?.id ?? null,
        metadata: { meta_cloud: baseMeta },
      })
      .select("id")
      .single();
    if (insErr || !insertedMsg) return jsonResponse(500, { error: "message_insert_failed", details: insErr?.message });

    // Self-heal: carimba primary_endpoint_id em threads pré-existentes que nunca
    // foram carimbadas. Idempotente — só atualiza quando ainda está NULL.
    // Garante que o badge "Novo · NNNN" apareça em threads reaproveitadas
    // (Lead Ads, templates, mensagens manuais).
    if (currentThreadId && endpoint?.id) {
      try {
        await supabase
          .from("message_threads")
          .update({ primary_endpoint_id: endpoint.id })
          .eq("id", currentThreadId)
          .eq("organization_id", organizationId)
          .is("primary_endpoint_id", null);
      } catch (healErr) {
        console.warn("[meta-whatsapp-send] primary_endpoint_id self-heal failed", healErr);
      }
    }

    // Reply context (Meta Cloud usa context.message_id = wamid)
    let context: { message_id: string } | undefined = undefined;
    if (replyToMessageId) {
      const { data: original } = await supabase
        .from("messages")
        .select("whatsapp_message_sid")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (original?.whatsapp_message_sid) {
        context = { message_id: original.whatsapp_message_sid };
      }
    }

    try {
      let outboundPayload: Record<string, unknown>;
      let mediaIdForMeta: string | null = null;
      let mimeUsed: string | null = null;
      let filenameUsed: string | null = null;

      if (isTemplateSend) {
        outboundPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: outboundTemplateComponents,
          },
        };
      } else if (hasMedia) {
        // 1) Baixa o arquivo da URL pública do Storage
        const sourceUrl = mediaUrlsArr[0];
        const fileRes = await fetch(sourceUrl);
        if (!fileRes.ok) {
          throw new Error(`source_fetch_failed_${fileRes.status}`);
        }
        const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
        const headerCt = fileRes.headers.get("content-type");
        mimeUsed = (typeof payloadMime === "string" && payloadMime.includes("/"))
          ? payloadMime
          : inferMimeType(kind!, sourceUrl, headerCt);
        filenameUsed = (typeof payloadFilename === "string" && payloadFilename)
          ? payloadFilename
          : filenameFromUrl(sourceUrl, `file-${Date.now()}`);

        // 2) Upload para Graph
        const uploaded = await metaWaUploadMedia(
          endpoint.sender_sid,
          fileBytes,
          mimeUsed,
          filenameUsed,
          { accessToken, appSecret },
        );
        mediaIdForMeta = uploaded.id;

        // 3) Monta payload por tipo
        const captionText = trimmedMessage.trim() || undefined;
        const mediaObj: Record<string, unknown> = { id: mediaIdForMeta };
        if (kind === "image" || kind === "video") {
          if (captionText) mediaObj.caption = captionText;
        } else if (kind === "document") {
          if (captionText) mediaObj.caption = captionText;
          mediaObj.filename = filenameUsed;
        }
        // audio: sem caption nem filename
        outboundPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: kind,
          [kind!]: mediaObj,
          ...(context ? { context } : {}),
        };
      } else {
        outboundPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: trimmedMessage, preview_url: false },
          ...(context ? { context } : {}),
        };
      }

      const result = await metaWaPostJson(
        `/${endpoint.sender_sid}/messages`,
        outboundPayload,
        { accessToken, appSecret },
      );

      const wamid = result?.messages?.[0]?.id ?? null;
      const finalMeta: Record<string, any> = {
        phone_number_id: endpoint.sender_sid,
        to,
        wamid,
        response: result,
      };
      if (hasMedia) {
        finalMeta.media_id = mediaIdForMeta;
        finalMeta.mime_type = mimeUsed;
        finalMeta.filename = filenameUsed;
        finalMeta.media_kind = kind;
        finalMeta.media_source_url = mediaUrlsArr[0];
      }
      if (isTemplateSend) {
        finalMeta.template = {
          name: templateName,
          language: templateLanguage,
          components: outboundTemplateComponents,
          rendered_preview: renderedPreview,
          template_id: templateRow?.id ?? null,
        };
      }

      await supabase
        .from("messages")
        .update({
          whatsapp_status: "sent",
          whatsapp_message_sid: wamid,
          metadata: { meta_cloud: finalMeta },
        })
        .eq("id", insertedMsg.id);

      // === Persistência da re-rota Comercial → Meta 7020 ===
      let migration_applied = false;
      let migration_persistence_error: string | null = null;
      if (
        migrationContext &&
        typeof migrationContext === "object" &&
        migrationContext.targetEndpointId &&
        migrationContext.noteKind &&
        currentThreadId
      ) {
        try {
          const { error: updErr } = await supabase
            .from("message_threads")
            .update({ primary_endpoint_id: migrationContext.targetEndpointId })
            .eq("id", currentThreadId)
            .neq("primary_endpoint_id", migrationContext.targetEndpointId);
          if (updErr) throw new Error(`thread_update_failed: ${updErr.message}`);

          const { data: existingNote, error: selErr } = await supabase
            .from("messages")
            .select("id")
            .eq("thread_id", currentThreadId)
            .eq("direction", "internal")
            .contains("metadata", { kind: migrationContext.noteKind })
            .limit(1)
            .maybeSingle();
          if (selErr) throw new Error(`note_lookup_failed: ${selErr.message}`);

          if (!existingNote) {
            const { error: insNoteErr } = await supabase
              .from("messages")
              .insert({
                organization_id: organizationId,
                thread_id: currentThreadId,
                content: migrationContext.noteText ??
                  "Conversa migrada para o novo número WhatsApp 7020 (Meta Cloud). Histórico anterior preservado.",
                direction: "internal",
                sender_type: "system",
                sender_name: "Sistema",
                sent_at: migrationNoteAt,
                created_at: migrationNoteAt,
                metadata: {
                  kind: migrationContext.noteKind,
                  previous_provider: migrationContext.previousProvider ?? "twilio",
                  migration_kind: migrationContext.kind ?? null,
                  target_endpoint_id: migrationContext.targetEndpointId,
                },
              });
            if (insNoteErr) throw new Error(`note_insert_failed: ${insNoteErr.message}`);
          }

          migration_applied = true;
        } catch (mErr) {
          migration_persistence_error = (mErr as Error).message;
          console.error("[meta-whatsapp-send] migration persistence failed", {
            threadId: currentThreadId,
            error: migration_persistence_error,
          });
        }
      }

      return jsonResponse(200, {
        success: true,
        messageId: insertedMsg.id,
        wamid,
        threadId: currentThreadId,
        provider: "meta_cloud_api",
        migration_applied,
        migration_persistence_error,
      });
    } catch (e) {
      const errDetails = e instanceof MetaWaGraphError
        ? { code: e.error.code, error_subcode: e.error.error_subcode, message: e.error.message }
        : { message: (e as Error).message };
      await supabase
        .from("messages")
        .update({
          whatsapp_status: "failed",
          error_code: errDetails.code ? String(errDetails.code) : null,
          error_message: errDetails.message,
          metadata: { meta_cloud: { ...baseMeta, error: errDetails } },
        })
        .eq("id", insertedMsg.id);
      return jsonResponse(500, { error: "meta_send_failed", details: errDetails });
    }

  } catch (e) {
    console.error("[meta-whatsapp-send] fatal", e);
    return jsonResponse(500, { error: "internal_error", message: (e as Error).message });
  }
});
