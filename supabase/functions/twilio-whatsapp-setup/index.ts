import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TwilioPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
}

interface V2Sender {
  sid: string;
  sender_id: string;
  status: string;
  webhook: {
    callback_url: string | null;
    callback_method: string | null;
    fallback_url: string | null;
    fallback_method: string | null;
    status_callback_url: string | null;
    status_callback_method: string | null;
  } | null;
  profile: any;
  properties: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== twilio-whatsapp-setup called ===");

    const body = await req.json();
    const { organizationId, accountSid, authToken, selectedNumber, mode } = body;

    console.log("Request:", {
      organizationId,
      mode,
      selectedNumber,
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
    });

    if (!organizationId || !accountSid || !authToken) {
      return new Response(JSON.stringify({ error: "Missing required fields: organizationId, accountSid, authToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = "Basic " + btoa(`${accountSid}:${authToken}`);

    // ─── Validate Twilio credentials ───
    const accountResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: authHeader },
    });

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      console.error("Twilio credentials failed:", errorText);
      return new Response(JSON.stringify({ error: "Invalid Twilio credentials", details: errorText }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountData = await accountResponse.json();
    console.log("Twilio account:", accountData.friendly_name);

    // ─── Helper: Fetch WhatsApp Senders via v2 API ───
    async function fetchWhatsAppSenders(): Promise<V2Sender[]> {
      const url = "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=100";
      console.log("[v2] Fetching WhatsApp senders...");
      const resp = await fetch(url, { headers: { Authorization: authHeader } });
      if (!resp.ok) {
        const err = await resp.text();
        console.error("[v2] Failed to list senders:", resp.status, err);
        return [];
      }
      const data = await resp.json();
      const senders = data.senders || [];
      console.log(
        "[v2] Found",
        senders.length,
        "WhatsApp senders:",
        senders.map((s: V2Sender) => `${s.sender_id} (${s.status}) SID:${s.sid}`),
      );
      return senders;
    }

    // ─── Helper: Update sender webhook via v2 API ───
    async function updateSenderWebhook(
      senderSid: string,
      callbackUrl: string,
      statusCallbackUrl: string,
    ): Promise<{ success: boolean; data?: any; error?: string }> {
      const url = `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`;
      const payload = {
        webhook: {
          callback_url: callbackUrl,
          callback_method: "POST",
          fallback_url: callbackUrl,
          fallback_method: "POST",
          status_callback_url: statusCallbackUrl,
          status_callback_method: "POST",
        },
      };
      console.log(`[v2] Updating webhook on sender ${senderSid}...`);
      console.log(`[v2] callback_url: ${callbackUrl}`);
      console.log(`[v2] status_callback_url: ${statusCallbackUrl}`);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const respText = await resp.text();
      console.log(`[v2] Update response: ${resp.status}`, respText.substring(0, 500));

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}: ${respText}` };
      }

      try {
        const data = JSON.parse(respText);
        return { success: true, data };
      } catch {
        return { success: true };
      }
    }

    // ─── Helper: Fetch phone numbers ───
    async function fetchPhoneNumbers(): Promise<TwilioPhoneNumber[]> {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`;
        const resp = await fetch(url, { headers: { Authorization: authHeader } });
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data.incoming_phone_numbers || []).map((pn: any) => ({
          sid: pn.sid,
          phone_number: pn.phone_number,
          friendly_name: pn.friendly_name || pn.phone_number,
        }));
      } catch (e) {
        console.warn("Error fetching phone numbers:", e);
        return [];
      }
    }

    // ════════════════════════════════════════════════════════════════
    // MODE: list-numbers
    // ════════════════════════════════════════════════════════════════
    if (mode === "list-numbers") {
      console.log("Mode: list-numbers");

      const phoneNumbers = await fetchPhoneNumbers();
      const v2Senders = await fetchWhatsAppSenders();

      const whatsappSenders = v2Senders.map((s) => ({
        sid: s.sid,
        sender_id: s.sender_id,
        phone_number: s.sender_id.replace("whatsapp:", ""),
        status: s.status,
        has_webhook: !!s.webhook?.callback_url,
        callback_url: s.webhook?.callback_url || null,
        status_callback_url: s.webhook?.status_callback_url || null,
      }));

      console.log("list-numbers result:", {
        phoneNumbers: phoneNumbers.length,
        whatsappSenders: whatsappSenders.length,
      });

      return new Response(
        JSON.stringify({
          success: true,
          phoneNumbers,
          whatsappSenders: whatsappSenders.map((s) => s.phone_number),
          v2Senders: whatsappSenders,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ════════════════════════════════════════════════════════════════
    // MODE: update-webhook (fix webhooks on existing sender)
    // ════════════════════════════════════════════════════════════════
    if (mode === "update-webhook") {
      console.log("Mode: update-webhook");

      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`;
      const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`;

      // 1. Fetch all WhatsApp senders via v2
      const v2Senders = await fetchWhatsAppSenders();

      if (v2Senders.length === 0) {
        console.warn("[update-webhook] No WhatsApp senders found in v2 API");
        return new Response(
          JSON.stringify({
            success: false,
            error: "no_v2_senders",
            message:
              "Nenhum WhatsApp Sender encontrado na API v2. O número pode ter sido registrado pelo método antigo. Verifique no Console do Twilio em Messaging > Senders > WhatsApp Senders.",
            webhookUrls: { inbound: inboundWebhookUrl, status: statusWebhookUrl },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 2. Find the target sender (by selectedNumber or update all)
      const targetNumber = selectedNumber || body.whatsappNumber || null;
      let sendersToUpdate = v2Senders;

      if (targetNumber) {
        const normalized = targetNumber.startsWith("+") ? targetNumber : `+${targetNumber}`;
        const targetSenderId = `whatsapp:${normalized}`;
        sendersToUpdate = v2Senders.filter((s) => s.sender_id === targetSenderId);

        if (sendersToUpdate.length === 0) {
          console.warn(
            `[update-webhook] Target sender ${targetSenderId} not found. Available:`,
            v2Senders.map((s) => s.sender_id),
          );
          // Fall back to updating all senders
          sendersToUpdate = v2Senders;
        }
      }

      // 3. Update webhook on each sender
      const results: { sender_id: string; sid: string; success: boolean; error?: string }[] = [];

      for (const sender of sendersToUpdate) {
        const result = await updateSenderWebhook(sender.sid, inboundWebhookUrl, statusWebhookUrl);
        results.push({
          sender_id: sender.sender_id,
          sid: sender.sid,
          success: result.success,
          error: result.error,
        });
        console.log(
          `[update-webhook] ${sender.sender_id}: ${result.success ? "✅ SUCCESS" : "❌ FAILED"} ${result.error || ""}`,
        );
      }

      // 4. Also update Messaging Service webhooks if one exists
      let messagingServiceUpdated = false;
      try {
        const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
        const { data: integration } = await supabase
          .from("organization_integrations")
          .select("config_values")
          .eq("organization_id", organizationId)
          .single();

        const msgSvcSid = integration?.config_values?.messaging_service_sid;
        if (msgSvcSid) {
          console.log("[update-webhook] Also updating Messaging Service:", msgSvcSid);
          const updateBody = `InboundRequestUrl=${encodeURIComponent(inboundWebhookUrl)}&InboundMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&UseInboundWebhookOnNumber=false`;
          const resp = await fetch(`https://messaging.twilio.com/v1/Services/${msgSvcSid}`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
            body: updateBody,
          });
          messagingServiceUpdated = resp.ok;
          console.log("[update-webhook] Messaging Service update:", resp.ok ? "✅" : "❌", resp.status);
        }
      } catch (e) {
        console.warn("[update-webhook] Error updating Messaging Service:", e);
      }

      const allSuccess = results.every((r) => r.success);

      return new Response(
        JSON.stringify({
          success: allSuccess,
          results,
          messagingServiceUpdated,
          webhookUrls: { inbound: inboundWebhookUrl, status: statusWebhookUrl },
          message: allSuccess
            ? `✅ Webhook configurado com sucesso em ${results.length} sender(s) via API v2.`
            : `⚠️ Alguns senders falharam. Verifique os detalhes.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ════════════════════════════════════════════════════════════════
    // MODE: verify-webhook (check current webhook status)
    // ════════════════════════════════════════════════════════════════
    if (mode === "verify-webhook") {
      console.log("Mode: verify-webhook");

      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const expectedInboundUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`;

      const v2Senders = await fetchWhatsAppSenders();

      const senderStatuses = v2Senders.map((s) => ({
        sender_id: s.sender_id,
        sid: s.sid,
        status: s.status,
        callback_url: s.webhook?.callback_url || null,
        status_callback_url: s.webhook?.status_callback_url || null,
        webhook_correct: s.webhook?.callback_url === expectedInboundUrl,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          senders: senderStatuses,
          expectedWebhookUrl: expectedInboundUrl,
          allCorrect: senderStatuses.every((s) => s.webhook_correct),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ════════════════════════════════════════════════════════════════
    // DEFAULT MODE: Full setup
    // ════════════════════════════════════════════════════════════════
    console.log("Mode: full-setup");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`;
    const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`;

    console.log("Webhook URLs:", { inboundWebhookUrl, statusWebhookUrl });

    // ─── Fetch phone numbers ───
    const phoneNumbers = await fetchPhoneNumbers();
    console.log("Found", phoneNumbers.length, "phone numbers");

    // ─── Fetch WhatsApp Senders via v2 ───
    const v2Senders = await fetchWhatsAppSenders();

    // ─── Configure webhooks on WhatsApp Senders via v2 ───
    const webhookResults: { sender_id: string; sid: string; success: boolean; error?: string }[] = [];

    for (const sender of v2Senders) {
      if (sender.status === "ONLINE" || sender.status === "ONLINE:UPDATING") {
        const result = await updateSenderWebhook(sender.sid, inboundWebhookUrl, statusWebhookUrl);
        webhookResults.push({
          sender_id: sender.sender_id,
          sid: sender.sid,
          success: result.success,
          error: result.error,
        });
      } else {
        console.log(`[setup] Skipping sender ${sender.sender_id} - status: ${sender.status}`);
      }
    }

    console.log("Webhook results:", webhookResults);

    // ─── Messaging Service (create/update for outbound use) ───
    const serviceName = `CRM WhatsApp - ${organizationId.slice(0, 8)}`;
    let messagingServiceSid: string | null = null;
    let messagingServiceCreated = false;

    try {
      const servicesUrl = "https://messaging.twilio.com/v1/Services?PageSize=100";
      const servicesResponse = await fetch(servicesUrl, { headers: { Authorization: authHeader } });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        const existingService = (servicesData.services || []).find((s: any) => s.friendly_name === serviceName);

        if (existingService) {
          messagingServiceSid = existingService.sid;
          console.log("Found existing Messaging Service:", messagingServiceSid);
        }
      }

      if (!messagingServiceSid) {
        const createBody = `FriendlyName=${encodeURIComponent(serviceName)}&InboundRequestUrl=${encodeURIComponent(inboundWebhookUrl)}&InboundMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&UseInboundWebhookOnNumber=false`;
        const createResponse = await fetch("https://messaging.twilio.com/v1/Services", {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
          body: createBody,
        });

        if (createResponse.ok) {
          const newService = await createResponse.json();
          messagingServiceSid = newService.sid;
          messagingServiceCreated = true;
          console.log("Created Messaging Service:", messagingServiceSid);
        }
      }

      // Update existing Messaging Service webhooks
      if (messagingServiceSid && !messagingServiceCreated) {
        const updateBody = `InboundRequestUrl=${encodeURIComponent(inboundWebhookUrl)}&InboundMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&UseInboundWebhookOnNumber=false`;
        await fetch(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
          body: updateBody,
        });
      }

      // Associate phone numbers to Messaging Service (for outbound)
      if (messagingServiceSid) {
        for (const number of phoneNumbers) {
          try {
            const resp = await fetch(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
              body: `PhoneNumberSid=${number.sid}`,
            });
            if (resp.ok || (await resp.json().catch(() => ({}))).code === 21710) {
              console.log("Phone number associated to Messaging Service:", number.phone_number);
            }
          } catch (e) {
            console.warn("Error associating number:", number.phone_number, e);
          }
        }
      }
    } catch (e) {
      console.warn("Error managing Messaging Service:", e);
    }

    // ─── Sync templates ───
    let templates: any[] = [];
    try {
      const templatesResponse = await fetch("https://content.twilio.com/v1/Content?PageSize=100", {
        headers: { Authorization: authHeader },
      });
      if (templatesResponse.ok) {
        const data = await templatesResponse.json();
        templates = data.contents || [];
        console.log("Found", templates.length, "templates");
      }
    } catch (e) {
      console.warn("Error fetching templates:", e);
    }

    // ─── Save to Supabase ───
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: adminIntegration } = await supabase
      .from("admin_integrations")
      .select("id")
      .eq("slug", "twilio-whatsapp")
      .single();

    if (!adminIntegration) {
      return new Response(JSON.stringify({ error: "WhatsApp integration not found in admin_integrations" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine primary number — prioritize ONLINE senders over OFFLINE ones
    const onlineSender = v2Senders.find((s) => s.status === "ONLINE" || s.status === "ONLINE:UPDATING");
    const primaryNumber =
      selectedNumber ||
      (onlineSender ? onlineSender.sender_id.replace("whatsapp:", "") : null) ||
      (v2Senders.length > 0 ? v2Senders[0].sender_id.replace("whatsapp:", "") : null) ||
      (phoneNumbers.length > 0 ? phoneNumbers[0].phone_number : null);
    const whatsappFrom = primaryNumber ? `whatsapp:${primaryNumber}` : null;

    console.log("Primary number selected:", primaryNumber, onlineSender ? "(ONLINE sender)" : "(fallback)");

    // Find the v2 sender SID for the primary number
    const primarySender = v2Senders.find((s) => s.sender_id === `whatsapp:${primaryNumber}`);

    const { error: upsertError } = await supabase.from("organization_integrations").upsert(
      {
        organization_id: organizationId,
        integration_id: adminIntegration.id,
        is_enabled: true,
        connected_at: new Date().toISOString(),
        config_values: {
          account_sid: accountSid,
          auth_token: authToken,
          messaging_service_sid: messagingServiceSid,
          whatsapp_number: primaryNumber,
          whatsapp_from: whatsappFrom,
          whatsapp_sender_sid: primarySender?.sid || null,
          available_numbers: phoneNumbers.map((n) => n.phone_number),
          v2_senders: v2Senders.map((s) => ({
            sid: s.sid,
            sender_id: s.sender_id,
            status: s.status,
          })),
          use_sandbox: false,
          inbound_webhook_url: inboundWebhookUrl,
          status_webhook_url: statusWebhookUrl,
          webhooks_configured: webhookResults.some((r) => r.success),
          webhook_method: "v2_senders_api",
          setup_completed_at: new Date().toISOString(),
        },
      },
      {
        onConflict: "organization_id,integration_id",
      },
    );

    if (upsertError) {
      console.error("Error saving integration:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to save integration config", details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Sync templates to database ───
    let syncedTemplates = 0;

    for (const template of templates) {
      const types = template.types || {};

      let extractedBody = "";
      let buttons: any[] = [];
      let actions: any[] = [];
      if (types["twilio/quick-reply"]) {
        extractedBody = types["twilio/quick-reply"].body || "";
        buttons = (types["twilio/quick-reply"].actions || []).map((a: any) => ({ title: a.title, id: a.id }));
      } else if (types["twilio/call-to-action"]) {
        extractedBody = types["twilio/call-to-action"].body || "";
        actions = (types["twilio/call-to-action"].actions || []).map((a: any) => ({
          type: a.type,
          title: a.title,
          url: a.url,
          phone: a.phone,
        }));
      } else if (types["twilio/list-picker"]) {
        extractedBody = types["twilio/list-picker"].body || "";
        actions = types["twilio/list-picker"].items || [];
      } else if (types["twilio/card"] || types["whatsapp/card"]) {
        const card = types["twilio/card"] || types["whatsapp/card"];
        extractedBody = card.body || card.title || "";
        actions = card.actions || [];
      } else if (types["whatsapp/authentication"]) {
        extractedBody = types["whatsapp/authentication"].body || "Authentication template";
      } else if (types["twilio/media"]) {
        extractedBody = types["twilio/media"].body || "";
      } else if (types["twilio/text"]) {
        extractedBody = types["twilio/text"].body || "";
      }

      let templateStatus = "draft";
      let templateCategory = "utility";
      let rejectionReason: string | null = null;

      try {
        const approvalResp = await fetch(`https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`, {
          headers: { Authorization: authHeader },
        });
        if (approvalResp.ok) {
          const approvalData = await approvalResp.json();
          if (approvalData.whatsapp) {
            const statusMap: Record<string, string> = {
              approved: "approved",
              pending: "pending",
              rejected: "rejected",
              paused: "rejected",
              disabled: "rejected",
              unsubmitted: "draft",
              received: "pending",
              under_review: "pending",
              in_review: "pending",
              submitted: "pending",
            };
            templateStatus = statusMap[approvalData.whatsapp.status] || "draft";
            templateCategory = (approvalData.whatsapp.category || "utility").toLowerCase();
            rejectionReason = approvalData.whatsapp.rejection_reason || null;
          }
        }
      } catch (e: any) {
        console.warn(`Template ${template.sid} approval fetch error:`, e?.message);
      }

      const { error: templateError } = await supabase.from("whatsapp_templates").upsert(
        {
          organization_id: organizationId,
          twilio_content_sid: template.sid,
          friendly_name: template.friendly_name || template.sid,
          language: template.language || "pt_BR",
          template_type: (() => {
            const tk = Object.keys(types);
            const tm: Record<string, string> = {
              "twilio/text": "text",
              "twilio/quick-reply": "quick-reply",
              "twilio/list-picker": "list-picker",
              "twilio/call-to-action": "call-to-action",
              "twilio/media": "media",
              "twilio/card": "call-to-action",
              "whatsapp/authentication": "text",
              "whatsapp/card": "call-to-action",
              "whatsapp/list-picker": "list-picker",
            };
            for (const k of tk) {
              if (tm[k]) return tm[k];
            }
            return "text";
          })(),
          body: extractedBody,
          variables: template.variables || [],
          metadata: { buttons, actions },
          status: templateStatus,
          category: templateCategory,
          rejection_reason: rejectionReason,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id,twilio_content_sid",
        },
      );

      if (!templateError) syncedTemplates++;
      else console.warn("Error syncing template:", template.sid, templateError);
    }

    console.log("Synced", syncedTemplates, "templates");

    // ─── Response ───
    const webhooksConfigured = webhookResults.filter((r) => r.success);

    const response = {
      success: true,
      messagingServiceSid,
      messagingServiceCreated,
      phoneNumbers: phoneNumbers.map((n) => ({ phoneNumber: n.phone_number, friendlyName: n.friendly_name })),
      v2Senders: v2Senders.map((s) => ({
        sid: s.sid,
        senderId: s.sender_id,
        status: s.status,
      })),
      webhookResults,
      webhooksConfigured: webhooksConfigured.length > 0,
      templatesImported: syncedTemplates,
      primaryNumber,
      message:
        webhooksConfigured.length > 0
          ? `✅ WhatsApp configurado! Webhook configurado em ${webhooksConfigured.length} sender(s) via v2 API.`
          : v2Senders.length === 0
            ? "⚠️ Nenhum WhatsApp Sender encontrado na API v2. Configure o webhook manualmente no Console."
            : "⚠️ Falha ao configurar webhooks nos senders. Verifique os logs.",
      setupDetails: {
        inboundWebhookUrl,
        statusWebhookUrl,
        webhookMethod: "v2_senders_api",
      },
    };

    console.log("=== Setup completed ===", JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Setup error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
