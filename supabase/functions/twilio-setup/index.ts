import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireTelephonyUser } from "../_shared/telephony/auth.ts";
import { encryptIntegrationSecret } from "../_shared/integration-credentials.ts";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import { loadTwilioVoiceConfig } from "../_shared/telephony/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-organization-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const context = await requireTelephonyUser(req);
    const body = await req.json();
    const organizationId = body.organizationId as string;
    let accountSid = body.accountSid as string | undefined;
    let authToken = body.authToken as string | undefined;
    let phoneNumber = body.phoneNumber as string | undefined;
    let enableRecording = body.enableRecording as boolean | undefined;

    if (organizationId !== context.organizationId) {
      return new Response(JSON.stringify({ error: "Forbidden organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const useV2 = await telephonyV2Enabled(context.admin, organizationId);
    const canConfigure = useV2
      ? context.permissions.can_manage_telephony === true
      : context.permissions.can_manage_telephony === true ||
        context.permissions.can_manage_integrations === true;
    if (!canConfigure) {
      return new Response(
        JSON.stringify({ error: "Telephony management permission required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: existingVoiceIntegration } = await context.admin
      .from("organization_integrations")
      .select("id, config_values, admin_integrations!inner(id, slug)")
      .eq("organization_id", organizationId)
      .eq("admin_integrations.slug", "twilio-voice")
      .maybeSingle();
    const existingValues =
      (existingVoiceIntegration?.config_values || {}) as Record<
        string,
        unknown
      >;

    if (body.mode === "status") {
      let credentialsAvailable = false;
      let credentialsEncrypted =
        typeof existingValues.auth_token_encrypted === "string";
      if (existingVoiceIntegration) {
        try {
          await loadTwilioVoiceConfig(context.admin, organizationId);
          credentialsAvailable = true;
          credentialsEncrypted = true;
        } catch (error) {
          console.warn(
            "Could not validate existing Twilio Voice credentials",
            error,
          );
        }
      }
      return new Response(
        JSON.stringify({
          configured: !!existingVoiceIntegration,
          credentialsAvailable,
          credentialsEncrypted,
          accountSid: existingValues.account_sid || null,
          phoneNumber: existingValues.phone_number || null,
          enableRecording: existingValues.enable_recording === true,
          twimlAppSidSuffix: typeof existingValues.twiml_app_sid === "string"
            ? existingValues.twiml_app_sid.slice(-8)
            : null,
          webhookMode: useV2 ? "telephony_v2" : "legacy",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (
      existingVoiceIntegration && (!accountSid || !authToken || !phoneNumber)
    ) {
      try {
        const resolved = await loadTwilioVoiceConfig(
          context.admin,
          organizationId,
        );
        accountSid ||= resolved.accountSid;
        authToken ||= resolved.authToken;
        phoneNumber ||= typeof existingValues.phone_number === "string"
          ? existingValues.phone_number
          : undefined;
        enableRecording ??= existingValues.enable_recording === true;
      } catch (error) {
        console.warn(
          "Existing Twilio Voice configuration cannot be reused",
          error,
        );
      }
    }

    if (!organizationId || !accountSid || !authToken || !phoneNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    // Webhook URL for the TwiML App
    const webhookUrl = useV2
      ? `${supabaseUrl}/functions/v1/telephony-webhook/voice`
      : `${supabaseUrl}/functions/v1/twilio-webhook/voice?orgId=${organizationId}`;

    console.log("Creating TwiML App with webhook URL:", webhookUrl);

    // Create TwiML Application via Twilio API
    const existingTwimlAppSid = typeof existingValues.twiml_app_sid === "string"
      ? existingValues.twiml_app_sid
      : null;
    let twilioApiUrl = existingTwimlAppSid
      ? `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${existingTwimlAppSid}.json`
      : `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications.json`;

    const formData = new URLSearchParams();
    formData.append(
      "FriendlyName",
      `CRM Voice App - ${organizationId.slice(0, 8)}`,
    );
    formData.append("VoiceUrl", webhookUrl);
    formData.append("VoiceMethod", "POST");

    let twilioResponse = await fetch(twilioApiUrl, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    // If a previously stored TwiML App no longer exists, create a replacement.
    if (!twilioResponse.ok && existingTwimlAppSid) {
      console.warn(
        "Stored TwiML App could not be updated; creating a replacement",
      );
      twilioApiUrl =
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications.json`;
      twilioResponse = await fetch(twilioApiUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });
    }

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error("Twilio API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to create TwiML App",
          details: errorText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const twilioData = await twilioResponse.json();
    const twimlAppSid = twilioData.sid || existingTwimlAppSid;

    console.log("TwiML App created successfully:", twimlAppSid);

    // ========== Configure the phone number to use the TwiML App ==========
    // This enables inbound calls to be routed to our webhook

    // Step 1: Find the phone number SID
    const phoneSearchUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${
        encodeURIComponent(phoneNumber)
      }`;

    console.log("Searching for phone number SID:", phoneNumber);

    let phoneNumberSid: string | null = null;

    const phoneListResponse = await fetch(phoneSearchUrl, {
      headers: {
        "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      },
    });

    if (phoneListResponse.ok) {
      const phoneListData = await phoneListResponse.json();
      phoneNumberSid = phoneListData.incoming_phone_numbers?.[0]?.sid;

      if (phoneNumberSid) {
        console.log("Found phone number SID:", phoneNumberSid);

        // Step 2: Update the phone number to use our TwiML App
        const updatePhoneUrl =
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`;

        const updateForm = new URLSearchParams();
        updateForm.append("VoiceApplicationSid", twimlAppSid);

        const updateResponse = await fetch(updatePhoneUrl, {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: updateForm.toString(),
        });

        if (!updateResponse.ok) {
          const updateError = await updateResponse.text();
          console.error("Failed to configure phone number:", updateError);
          if (useV2) {
            return new Response(
              JSON.stringify({
                error:
                  "A TwiML App foi atualizada, mas não foi possível vinculá-la ao número Twilio",
                details: updateError,
              }),
              {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        } else {
          console.log("Phone number configured to use TwiML App successfully");
        }
      } else {
        console.warn(
          "Phone number not found in Twilio account. Inbound calls may not work.",
        );
      }
    } else {
      const searchError = await phoneListResponse.text();
      console.error("Failed to search for phone number:", searchError);
    }
    if (useV2 && !phoneNumberSid) {
      return new Response(
        JSON.stringify({
          error: "O número informado não foi encontrado nesta conta Twilio",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // ========== END: Phone number configuration ==========

    const supabase = context.admin;

    // Get the Twilio Voice integration ID
    const { data: twilioIntegration, error: integrationLookupError } =
      await supabase
        .from("admin_integrations")
        .select("id")
        .eq("slug", "twilio-voice")
        .single();

    if (integrationLookupError || !twilioIntegration) {
      console.error(
        "Error finding Twilio Voice integration:",
        integrationLookupError,
      );
      return new Response(
        JSON.stringify({
          error: "Twilio Voice integration not found in admin_integrations",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Found Twilio Voice integration:", twilioIntegration.id);

    // UPSERT the organization integration with the TwiML App SID
    const encryptedAuthToken = await encryptIntegrationSecret(authToken);
    const securedConfigValues: Record<string, unknown> = {
      ...existingValues,
      account_sid: accountSid,
      auth_token_encrypted: encryptedAuthToken,
      phone_number: phoneNumber,
      enable_recording: enableRecording || false,
      twiml_app_sid: twimlAppSid,
    };
    delete securedConfigValues.auth_token;
    delete securedConfigValues.api_key_secret;
    const integrationPayload = {
      organization_id: organizationId,
      integration_id: twilioIntegration.id,
      config_values: securedConfigValues,
      is_enabled: true,
      connected_at: new Date().toISOString(),
    };
    let organizationIntegrationId = existingVoiceIntegration?.id as
      | string
      | undefined;
    let integrationSaveError: { message: string } | null = null;
    if (organizationIntegrationId) {
      const { error } = await supabase
        .from("organization_integrations")
        .update(integrationPayload)
        .eq("id", organizationIntegrationId)
        .eq("organization_id", organizationId);
      integrationSaveError = error;
    } else {
      const { data, error } = await supabase
        .from("organization_integrations")
        .insert(integrationPayload)
        .select("id")
        .single();
      integrationSaveError = error;
      organizationIntegrationId = data?.id;
    }

    if (integrationSaveError || !organizationIntegrationId) {
      console.error("Error saving integration:", integrationSaveError);
      return new Response(
        JSON.stringify({
          error: "Failed to save integration config",
          details: integrationSaveError?.message || "Missing integration id",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "Integration saved successfully for organization:",
      organizationId,
    );

    await supabase
      .from("organization_phone_numbers")
      .update({ is_default_outbound: false, is_primary: false })
      .eq("organization_id", organizationId)
      .eq("provider", "twilio")
      .neq("phone_number", phoneNumber);

    // ========== Insert/Update phone number in organization_phone_numbers ==========
    const { data: savedPhone, error: phoneInsertError } = await supabase
      .from("organization_phone_numbers")
      .upsert({
        organization_id: organizationId,
        phone_number: phoneNumber,
        friendly_name: "Número Principal",
        twilio_phone_sid: phoneNumberSid,
        provider: "twilio",
        provider_number_id: phoneNumberSid,
        organization_integration_id: organizationIntegrationId,
        number_type: "company",
        is_active: true,
        is_default_outbound: true,
        recording_enabled: enableRecording || false,
        max_attempts: 3,
        missed_call_owner_user_id: context.userId,
        is_primary: true,
        ring_strategy: "round_robin",
        ring_timeout_seconds: 15,
      }, {
        onConflict: "organization_id,phone_number",
      })
      .select("id")
      .single();

    if (phoneInsertError) {
      console.error("Error inserting phone number:", phoneInsertError);
      if (useV2) {
        return new Response(
          JSON.stringify({
            error: "Falha ao registrar o número na Telefonia V2",
            details: phoneInsertError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      console.log("Phone number registered in organization_phone_numbers");
      const { error: numberUserError } = await supabase.from(
        "organization_phone_number_users",
      ).upsert({
        organization_id: organizationId,
        phone_number_id: savedPhone.id,
        user_id: context.userId,
        can_receive_calls: true,
        can_originate_calls: true,
        priority: 1,
      }, { onConflict: "phone_number_id,user_id" });
      if (numberUserError && useV2) {
        return new Response(
          JSON.stringify({
            error: "Falha ao autorizar o gestor no número Twilio",
            details: numberUserError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }
    // ========== END: Phone number registration ==========

    return new Response(
      JSON.stringify({
        success: true,
        twimlAppSid,
        message: "Twilio Voice configured successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    console.error("Setup error:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
