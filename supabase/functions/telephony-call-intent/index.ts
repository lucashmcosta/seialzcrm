import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import {
  normalizeE164BR,
  TwilioVoiceAdapter,
} from "../_shared/telephony/twilio.ts";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import type { TelephonyCallIntentRequest } from "../_shared/telephony/types.ts";

// deno-lint-ignore no-explicit-any
async function authorizedNumber(
  admin: any,
  organizationId: string,
  userId: string,
  requestedId?: string,
) {
  const selection =
    "id, organization_id, phone_number, provider, number_type, assigned_user_id, is_default_outbound, recording_enabled";
  if (requestedId) {
    const { data: number } = await admin.from("organization_phone_numbers")
      .select(selection).eq("id", requestedId).eq(
        "organization_id",
        organizationId,
      ).eq("is_active", true).maybeSingle();
    // Do not reveal whether a number exists in another organization.
    if (!number) return { error: "phone_number_not_authorized" };
    const isOwner = number.number_type === "user" &&
      number.assigned_user_id === userId;
    const { data: grant } = await admin.from("organization_phone_number_users")
      .select("id").eq("phone_number_id", number.id).eq("user_id", userId).eq(
        "can_originate_calls",
        true,
      ).maybeSingle();
    if (!isOwner && !grant) return { error: "phone_number_not_authorized" };
    return { number };
  }

  const { data: personal } = await admin.from("organization_phone_numbers")
    .select(selection).eq("organization_id", organizationId).eq(
      "number_type",
      "user",
    )
    .eq("assigned_user_id", userId).eq("is_active", true).order("created_at")
    .limit(1).maybeSingle();
  if (personal) return { number: personal };

  const { data: defaults } = await admin.from("organization_phone_numbers")
    .select(selection).eq("organization_id", organizationId).eq(
      "number_type",
      "company",
    )
    .eq("is_default_outbound", true).eq("is_active", true).order("created_at");
  for (const number of defaults ?? []) {
    const { data: grant } = await admin.from("organization_phone_number_users")
      .select("id").eq("phone_number_id", number.id).eq("user_id", userId).eq(
        "can_originate_calls",
        true,
      ).maybeSingle();
    if (grant) return { number };
  }
  return { error: "no_authorized_outbound_number" };
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  // warm-ping (cron): mantém a function quente (aqui: criação da chamada → discagem).
  if (new URL(req.url).pathname.endsWith("/warm")) return new Response("ok");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const context = await requireTelephonyUser(req);
    // Permissão vem em memória do requireTelephonyUser (sem query) → checa primeiro,
    // fail-fast de graça, antes de disparar qualquer leitura.
    if (context.permissions.can_make_calls !== true) {
      return json({ error: "cannot_make_calls" }, 403);
    }
    const body = await req.json() as TelephonyCallIntentRequest;
    if (!body.to) return json({ error: "phone_required" }, 400);

    // Caminho crítico da discagem: flag v2, número autorizado, e as validações de
    // contato/oportunidade são todas independentes (só dependem do org do auth) →
    // em paralelo em vez de 4 round-trips em série. O insert (que precisa do
    // number.id) continua depois. Nenhuma escrita muda; só reordena as leituras.
    const [v2Enabled, selected, contactMissing, opportunityMissing] =
      await Promise.all([
        telephonyV2Enabled(context.admin, context.organizationId),
        authorizedNumber(
          context.admin,
          context.organizationId,
          context.userId,
          body.phoneNumberId,
        ),
        body.contactId
          ? context.admin.from("contacts").select("id")
            .eq("id", body.contactId).eq(
              "organization_id",
              context.organizationId,
            )
            .is("deleted_at", null).maybeSingle().then((r: { data: unknown }) =>
              !r.data
            )
          : Promise.resolve(false),
        body.opportunityId
          ? context.admin.from("opportunities").select("id")
            .eq("id", body.opportunityId).eq(
              "organization_id",
              context.organizationId,
            ).is("deleted_at", null).maybeSingle().then((
              r: { data: unknown },
            ) => !r.data)
          : Promise.resolve(false),
      ]);
    if (!v2Enabled) return json({ error: "telephony_v2_disabled" }, 404);
    if (selected.error || !selected.number) {
      return json(
        { error: selected.error ?? "phone_number_not_found" },
        selected.error === "phone_number_not_authorized" ? 403 : 400,
      );
    }
    if (contactMissing) return json({ error: "contact_not_found" }, 404);
    if (opportunityMissing) {
      return json({ error: "opportunity_not_found" }, 404);
    }
    const number = selected.number;

    const toE164 = normalizeE164BR(body.to);
    const { data: call, error } = await context.admin.from("calls").insert({
      organization_id: context.organizationId,
      user_id: context.userId,
      initiated_by_user_id: context.userId,
      current_agent_user_id: context.userId,
      contact_id: body.contactId ?? null,
      opportunity_id: body.opportunityId ?? null,
      phone_number_id: number.id,
      provider: number.provider,
      direction: "outgoing",
      call_type: "made",
      from_number: number.phone_number,
      to_number: toE164,
      status: "queued",
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !call) {
      throw new Error(
        `call_intent_insert_failed:${error?.message ?? "unknown"}`,
      );
    }
    const adapter = new TwilioVoiceAdapter(context.admin);

    return json({
      callId: call.id,
      provider: number.provider,
      phoneNumberId: number.id,
      from: number.phone_number,
      toE164,
      connectParams: adapter.connectionParams({
        to: toE164,
        callId: call.id,
        phoneNumberId: number.id,
      }),
    }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-call-intent]", error);
    return json({
      error: error instanceof Error ? error.message : "internal_error",
    }, 500);
  }
});
