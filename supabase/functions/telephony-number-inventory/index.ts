import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import {
  safeTwilioError,
  twilioAccountUrl,
  twilioApiContext,
  twilioRequest,
} from "../_shared/telephony/twilio-api.ts";

interface IncomingNumber {
  sid: string;
  phone_number: string;
  friendly_name?: string;
  iso_country?: string;
  type?: string;
  capabilities?: Record<string, boolean>;
  voice_application_sid?: string | null;
  status_callback?: string | null;
}

function requireManager(permissions: Record<string, boolean>) {
  if (permissions.can_manage_telephony !== true) {
    throw new Response(
      JSON.stringify({ error: "telephony_management_required" }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const context = await requireTelephonyUser(req);
    requireManager(context.permissions);
    if (!await telephonyV2Enabled(context.admin, context.organizationId)) {
      return json({ error: "telephony_v2_disabled" }, 404);
    }
    const body = await req.json() as {
      action?: string;
      providerNumberIds?: string[];
    };
    const twilio = await twilioApiContext(
      context.admin,
      context.organizationId,
    );
    const response = await twilioRequest<
      { incoming_phone_numbers?: IncomingNumber[] }
    >(
      twilio,
      `${twilioAccountUrl(twilio, "IncomingPhoneNumbers.json")}?PageSize=1000`,
    );
    const owned = response.incoming_phone_numbers ?? [];
    const { data: local } = await context.admin.from(
      "organization_phone_numbers",
    )
      .select(
        "id, provider_number_id, phone_number, number_type, assigned_user_id, is_active, sync_status, friendly_name",
      )
      .eq("organization_id", context.organizationId).eq("provider", "twilio");

    if (body.action === "list" || !body.action) {
      return json({
        numbers: owned.map((number) => {
          const canonical = (local ?? []).find((row) =>
            row.provider_number_id === number.sid ||
            row.phone_number === number.phone_number
          );
          return {
            providerNumberId: number.sid,
            phoneNumber: number.phone_number,
            friendlyName: number.friendly_name || number.phone_number,
            isoCountry: number.iso_country || null,
            numberKind: number.type || null,
            capabilities: number.capabilities || {},
            voiceConfigured:
              number.voice_application_sid === twilio.twimlAppSid,
            canonical: canonical || null,
          };
        }),
      });
    }

    if (body.action !== "sync") return json({ error: "invalid_action" }, 400);
    const requested = [...new Set(body.providerNumberIds ?? [])];
    if (
      !requested.length ||
      requested.some((sid) => !/^PN[a-fA-F0-9]{32}$/.test(sid))
    ) {
      return json({ error: "provider_number_ids_required" }, 400);
    }
    const selected = requested.map((sid) =>
      owned.find((number) => number.sid === sid)
    );
    if (selected.some((number) => !number)) {
      return json({ error: "provider_number_not_owned" }, 403);
    }
    if (
      selected.some((number) => number?.capabilities?.voice !== true)
    ) return json({ error: "provider_number_without_voice" }, 400);
    const { data: defaultNumber } = await context.admin.from(
      "organization_phone_numbers",
    )
      .select("id").eq("organization_id", context.organizationId).eq(
        "provider",
        "twilio",
      )
      .eq("number_type", "company").eq("is_active", true).eq(
        "is_default_outbound",
        true,
      )
      .maybeSingle();
    let defaultExists = !!defaultNumber;
    const synced: Array<
      { id: string; providerNumberId: string; phoneNumber: string }
    > = [];
    for (const number of selected as IncomingNumber[]) {
      await twilioRequest(
        twilio,
        twilioAccountUrl(twilio, `IncomingPhoneNumbers/${number.sid}.json`),
        { method: "POST", form: { VoiceApplicationSid: twilio.twimlAppSid } },
      );
      const existing = (local ?? []).find((row) =>
        row.provider_number_id === number.sid ||
        row.phone_number === number.phone_number
      );
      const isNewNumber = !existing;
      let saved: { id: string } | null = null;
      if (existing) {
        const result = await context.admin.from("organization_phone_numbers")
          .update({
            organization_integration_id: twilio.integrationId,
            provider_number_id: number.sid,
            twilio_phone_sid: number.sid,
            iso_country: number.iso_country || null,
            number_kind: number.type || null,
            capabilities: number.capabilities || {},
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
          }).eq("id", existing.id).eq("organization_id", context.organizationId)
          .select("id").single();
        if (result.error) {
          throw new Error(`number_sync_failed:${result.error.message}`);
        }
        saved = result.data;
      } else {
        const makeDefault = !defaultExists;
        const result = await context.admin.from("organization_phone_numbers")
          .insert({
            organization_id: context.organizationId,
            organization_integration_id: twilio.integrationId,
            provider: "twilio",
            provider_number_id: number.sid,
            twilio_phone_sid: number.sid,
            phone_number: number.phone_number,
            friendly_name: number.friendly_name || number.phone_number,
            iso_country: number.iso_country || null,
            number_kind: number.type || null,
            capabilities: number.capabilities || {},
            number_type: "company",
            is_active: true,
            is_primary: makeDefault,
            is_default_outbound: makeDefault,
            recording_enabled: false,
            ring_strategy: "round_robin",
            ring_timeout_seconds: 15,
            max_attempts: 3,
            missed_call_owner_user_id: context.userId,
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
          }).select("id").single();
        if (result.error) {
          throw new Error(`number_sync_failed:${result.error.message}`);
        }
        saved = result.data;
        defaultExists ||= makeDefault;
      }
      if (!saved) throw new Error("number_sync_failed");
      // Existing numbers keep every routing and origination grant untouched.
      // A new import gets one explicit initial manager grant to avoid an
      // implicit "all current and future users" authorization.
      if (isNewNumber) {
        await context.admin.from("organization_phone_number_users").upsert({
          organization_id: context.organizationId,
          phone_number_id: saved.id,
          user_id: context.userId,
          can_receive_calls: true,
          can_originate_calls: true,
          priority: 1,
        }, { onConflict: "phone_number_id,user_id" });
      }
      synced.push({
        id: saved.id,
        providerNumberId: number.sid,
        phoneNumber: number.phone_number,
      });
    }
    return json({ success: true, synced });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-number-inventory]", error);
    const safe = safeTwilioError(error);
    return json({ error: safe.code, detail: safe.detail }, 500);
  }
});
