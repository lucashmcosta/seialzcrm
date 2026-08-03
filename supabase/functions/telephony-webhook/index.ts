import { createClient } from "npm:@supabase/supabase-js@2";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import {
  escapeXml,
  normalizeE164BR,
  TwilioVoiceAdapter,
} from "../_shared/telephony/twilio.ts";
import { resolveContactIngressIdentity } from "../_shared/registry/ingress.ts";
import {
  canApplyCallStatus,
  isTerminalCallStatus,
  telephonyAttemptLimit,
} from "../_shared/telephony/routing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BASE_URL = `${SUPABASE_URL}/functions/v1/telephony-webhook`;
const LEGACY_VOICE_URL = `${SUPABASE_URL}/functions/v1/twilio-webhook/voice`;
const admin = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const voiceAdapter = new TwilioVoiceAdapter(admin);

function xml(body: string, status = 200): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      status,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    },
  );
}

function empty(status = 204): Response {
  return new Response(null, { status });
}

function message(text: string): Response {
  return xml(`<Say language="pt-BR">${escapeXml(text)}</Say><Hangup/>`);
}

async function paramsOf(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => params[key] = String(value));
  return params;
}

// deno-lint-ignore no-explicit-any
async function resolveNumberByAddress(address: string): Promise<any | null> {
  const e164 = normalizeE164BR(address.replace(/^client:/, ""));
  const { data } = await admin.from("organization_phone_numbers")
    .select("*, organizations!inner(timezone)")
    .eq("provider", "twilio")
    .eq("phone_number", e164)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

// deno-lint-ignore no-explicit-any
async function callContext(
  callId: string,
): Promise<{ call: any; number: any } | null> {
  const { data: call } = await admin.from("calls").select("*").eq("id", callId)
    .maybeSingle();
  if (!call?.phone_number_id) return null;
  const { data: number } = await admin.from("organization_phone_numbers")
    .select("*")
    .eq("id", call.phone_number_id).eq("organization_id", call.organization_id)
    .maybeSingle();
  return number ? { call, number } : null;
}

async function verifySignature(
  req: Request,
  params: Record<string, string>,
  organizationId: string,
): Promise<boolean> {
  try {
    return await voiceAdapter.verifyWebhook({
      request: req,
      params,
      organizationId,
    });
  } catch (error) {
    console.error("[telephony-webhook] signature_config_error", error);
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function resolveFallbackOwner(number: any): Promise<string | null> {
  if (number.missed_call_owner_user_id) {
    const { data } = await admin.from("user_organizations").select("user_id")
      .eq("organization_id", number.organization_id)
      .eq("user_id", number.missed_call_owner_user_id)
      .eq("is_active", true).maybeSingle();
    if (data) return data.user_id;
  }
  const { data: memberships } = await admin.from("user_organizations")
    .select("user_id, permission_profiles!inner(permissions)")
    .eq("organization_id", number.organization_id).eq("is_active", true).order(
      "created_at",
    );
  const manager = (memberships ?? []).find((row) => {
    const p = (row.permission_profiles as unknown as {
      permissions?: Record<string, boolean>;
    })?.permissions;
    return p?.can_manage_telephony === true;
  });
  return manager?.user_id ?? null;
}

// deno-lint-ignore no-explicit-any
async function fallback(call: any, number: any): Promise<Response> {
  const { data: latest } = await admin.from("calls")
    .select("status, result, missed_task_id, ended_at")
    .eq("id", call.id)
    .maybeSingle();
  if (
    latest &&
    (["in-progress", "completed"].includes(latest.status) ||
      latest.result === "answered")
  ) {
    return xml("<Hangup/>");
  }
  call = { ...call, ...latest };
  const owner = await resolveFallbackOwner(number);
  let taskId: string | null = call.missed_task_id ?? null;
  if (owner && !taskId) {
    const { data: task, error } = await admin.from("tasks").insert({
      organization_id: call.organization_id,
      assigned_user_id: owner,
      contact_id: call.contact_id,
      opportunity_id: call.opportunity_id,
      title: `Retornar chamada perdida de ${
        call.from_number ?? "número desconhecido"
      }`,
      description: `Chamada recebida pelo número ${
        number.friendly_name || number.phone_number
      } não foi atendida.`,
      task_type: "missed_call",
      status: "open",
      priority: "high",
      due_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      source_external_id: call.id,
    }).select("id").maybeSingle();
    if (error?.code === "23505") {
      const { data: existing } = await admin.from("tasks").select("id")
        .eq("organization_id", call.organization_id)
        .eq("source_external_id", call.id)
        .eq("task_type", "missed_call").maybeSingle();
      taskId = existing?.id ?? null;
    } else {
      if (error) console.error("[telephony-webhook] missed_task_failed", error);
      taskId = task?.id ?? null;
    }
  }
  await admin.from("calls").update({
    status: "no-answer",
    result: "missed",
    ended_at: new Date().toISOString(),
    missed_task_id: taskId,
  }).eq("id", call.id);
  if (!owner) {
    console.error("[telephony-webhook] no_fallback_owner", {
      callId: call.id,
      numberId: number.id,
    });
  }
  return message(
    number.fallback_message ||
      "No momento não podemos atender. Retornaremos em breve.",
  );
}

// deno-lint-ignore no-explicit-any
async function findOrCreateContact(
  number: any,
  from: string,
): Promise<string | null> {
  const e164 = normalizeE164BR(from);
  const digits = e164.replace(/\D/g, "");
  const { data: existing } = await admin.from("contacts").select("id")
    .eq("organization_id", number.organization_id).is("deleted_at", null)
    .or(`phone.eq.${e164},phone_normalized.eq.${digits}`).limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const inbound = (number.inbound_settings ?? {}) as Record<string, unknown>;
  if (inbound.auto_create_contact === false) return null;
  const identity = await resolveContactIngressIdentity(admin, {
    organizationId: number.organization_id,
    source: "twilio_voice",
    externalId: e164,
    fullName: `Novo contato ${e164}`,
    safePayload: { phone_suffix: digits.slice(-4) },
  });
  if (!identity.ok) return null;
  const { data } = await admin.from("contacts").insert({
    organization_id: number.organization_id,
    full_name: identity.fullName,
    first_name: identity.firstName,
    last_name: identity.lastName,
    address_country_code: identity.country,
    phone: e164,
    source: "inbound_call",
    lifecycle_stage: inbound.default_lifecycle_stage || "lead",
  }).select("id").single();
  return data?.id ?? null;
}

// deno-lint-ignore no-explicit-any
function renderAttempt(call: any, number: any, attempt: any): Response {
  const identity = `user-${attempt.user_id}-org-${call.organization_id}`;
  const query = `callId=${call.id}&attemptId=${attempt.id}`;
  const routeUrl = escapeXml(`${BASE_URL}/route?${query}`);
  const statusUrl = escapeXml(`${BASE_URL}/status?${query}`);
  const recordingUrl = escapeXml(`${BASE_URL}/recording?${query}`);
  const record = number.recording_enabled
    ? ` record="record-from-answer-dual" recordingStatusCallback="${recordingUrl}"`
    : "";
  return xml(
    `<Dial timeout="${
      number.ring_timeout_seconds ?? 15
    }" action="${routeUrl}"${record}><Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed"><Identity>${
      escapeXml(identity)
    }</Identity><Parameter name="CallId" value="${
      escapeXml(call.id)
    }"/></Client></Dial>`,
  );
}

// deno-lint-ignore no-explicit-any
async function nextRecipient(call: any, number: any): Promise<Response> {
  const { data: attempts } = await admin.from("call_attempts")
    .select("user_id, attempt_number").eq("call_id", call.id).order(
      "attempt_number",
    );
  const tried = (attempts ?? []).map((row) => row.user_id).filter(Boolean);
  if (
    tried.length >=
      telephonyAttemptLimit(number.number_type, number.max_attempts)
  ) {
    return await fallback(call, number);
  }
  const { data, error } = await admin.rpc("claim_next_telephony_recipient", {
    _phone_number_id: number.id,
    _excluded_user_ids: tried,
    _call_id: call.id,
  });
  if (error || !data?.[0]?.user_id) return await fallback(call, number);
  const recipient = data[0];
  const { data: attempt, error: attemptError } = await admin.from(
    "call_attempts",
  ).insert({
    organization_id: call.organization_id,
    call_id: call.id,
    user_id: recipient.user_id,
    attempt_number: recipient.attempt_number,
    provider: "twilio",
    status: "queued",
  }).select("id").single();
  if (attemptError || !attempt) return await fallback(call, number);

  return renderAttempt(call, number, attempt);
}

async function handleVoice(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const callId = params.CallId;
  if (callId) {
    const context = await callContext(callId);
    if (!context) return message("Não foi possível iniciar a chamada.");
    if (!await verifySignature(req, params, context.call.organization_id)) {
      return empty(403);
    }
    if (!await telephonyV2Enabled(admin, context.call.organization_id)) {
      return empty(404);
    }
    if (
      context.call.direction !== "outgoing" ||
      !["queued", "initiated", "ringing"].includes(context.call.status)
    ) {
      return message("Chamada inválida ou já processada.");
    }
    const parentSid = params.CallSid;
    const { data: attempt } = await admin.from("call_attempts").upsert({
      organization_id: context.call.organization_id,
      call_id: context.call.id,
      user_id: context.call.initiated_by_user_id,
      attempt_number: 1,
      provider: "twilio",
      provider_call_sid: parentSid,
      status: "initiated",
    }, { onConflict: "call_id,attempt_number" }).select("id").single();
    await admin.from("calls").update({
      call_sid: parentSid,
      provider_parent_call_id: parentSid,
      status: "initiated",
    }).eq("id", context.call.id);
    const query = `callId=${context.call.id}&attemptId=${attempt?.id ?? ""}`;
    const routeUrl = escapeXml(`${BASE_URL}/route?${query}`);
    const statusUrl = escapeXml(`${BASE_URL}/status?${query}`);
    const recordingUrl = escapeXml(`${BASE_URL}/recording?${query}`);
    const record = context.number.recording_enabled
      ? ` record="record-from-answer-dual" recordingStatusCallback="${recordingUrl}"`
      : "";
    return xml(
      `<Dial callerId="${
        escapeXml(context.number.phone_number)
      }" timeout="30" action="${routeUrl}"${record}><Number statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed">${
        escapeXml(context.call.to_number)
      }</Number></Dial>`,
    );
  }

  const called = params.Called || params.To;
  const from = params.From || params.Caller;
  if (!called || !from || from.startsWith("client:")) {
    return message("Chamada inválida.");
  }
  const number = await resolveNumberByAddress(called);
  if (!number) return message("Número não configurado.");
  if (!await verifySignature(req, params, number.organization_id)) {
    return empty(403);
  }
  if (!await telephonyV2Enabled(admin, number.organization_id)) {
    const legacyUrl = escapeXml(
      `${LEGACY_VOICE_URL}?orgId=${encodeURIComponent(number.organization_id)}`,
    );
    return xml(`<Redirect method="POST">${legacyUrl}</Redirect>`);
  }
  const fallbackOwner = await resolveFallbackOwner(number);
  const compatibilityOwner = fallbackOwner ?? number.missed_call_owner_user_id;
  if (!compatibilityOwner) {
    console.error("[telephony-webhook] inbound_without_compatibility_owner", {
      numberId: number.id,
      callSid: params.CallSid,
    });
    return message(
      number.fallback_message || "No momento não podemos atender.",
    );
  }
  const contactId = await findOrCreateContact(number, from);
  let { data: call } = await admin.from("calls").select("*").eq(
    "call_sid",
    params.CallSid,
  ).maybeSingle();
  if (call) {
    const { data: existingAttempt } = await admin.from("call_attempts").select(
      "*",
    )
      .eq("call_id", call.id).order("attempt_number", { ascending: false })
      .limit(1).maybeSingle();
    if (existingAttempt && !existingAttempt.ended_at) {
      return renderAttempt(call, number, existingAttempt);
    }
    if (call.status === "no-answer") return await fallback(call, number);
  } else {
    const inserted = await admin.from("calls").insert({
      organization_id: number.organization_id,
      user_id: compatibilityOwner,
      contact_id: contactId,
      phone_number_id: number.id,
      provider: "twilio",
      direction: "incoming",
      call_type: "received",
      call_sid: params.CallSid,
      provider_parent_call_id: params.CallSid,
      from_number: normalizeE164BR(from),
      to_number: number.phone_number,
      status: "ringing",
      started_at: new Date().toISOString(),
    }).select("*").single();
    call = inserted.data;
    if (inserted.error?.code === "23505") {
      const duplicate = await admin.from("calls").select("*").eq(
        "call_sid",
        params.CallSid,
      ).single();
      call = duplicate.data;
    } else if (inserted.error) {
      console.error(
        "[telephony-webhook] inbound_call_insert_failed",
        inserted.error,
      );
    }
  }
  if (!call) {
    return message(
      number.fallback_message || "No momento não podemos atender.",
    );
  }
  return await nextRecipient(call, number);
}

async function handleRoute(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const callId = url.searchParams.get("callId");
  const attemptId = url.searchParams.get("attemptId");
  if (!callId) return empty(400);
  const context = await callContext(callId);
  if (
    !context ||
    !await verifySignature(req, params, context.call.organization_id)
  ) return empty(403);
  const dialStatus = voiceAdapter.normalizeStatus(
    params.DialCallStatus || params.CallStatus || "failed",
  );
  const { data: currentAttempt } = attemptId
    ? await admin.from("call_attempts").select(
      "user_id, attempt_number, status, ended_at, duration_seconds",
    )
      .eq("id", attemptId).eq("call_id", callId).maybeSingle()
    : { data: null };
  if (currentAttempt?.ended_at) {
    if (["completed", "answered"].includes(currentAttempt.status)) {
      await admin.from("calls").update({
        status: "completed",
        result: "answered",
        ended_at: context.call.ended_at ?? new Date().toISOString(),
        duration_seconds: currentAttempt.duration_seconds ??
          context.call.duration_seconds,
      }).eq("id", callId);
      return xml("<Hangup/>");
    }
    const { data: followingAttempt } = await admin.from("call_attempts").select(
      "*",
    )
      .eq("call_id", callId).eq(
        "attempt_number",
        currentAttempt.attempt_number + 1,
      ).maybeSingle();
    if (followingAttempt && !followingAttempt.ended_at) {
      return renderAttempt(context.call, context.number, followingAttempt);
    }
    if (context.call.status === "no-answer") {
      return await fallback(context.call, context.number);
    }
  }
  if (attemptId) {
    await admin.from("call_attempts").update({
      status: dialStatus,
      provider_call_sid: params.DialCallSid || params.CallSid || null,
      ended_at: new Date().toISOString(),
      duration_seconds:
        Number(params.DialCallDuration || params.CallDuration || 0) || null,
      failure_reason:
        ["busy", "no-answer", "failed", "canceled"].includes(dialStatus)
          ? dialStatus
          : null,
    }).eq("id", attemptId).eq("call_id", callId);
    if (currentAttempt?.user_id) {
      await admin.from("telephony_presence").update({ active_call_id: null })
        .eq("organization_id", context.call.organization_id)
        .eq("user_id", currentAttempt.user_id)
        .eq("active_call_id", callId);
    }
  }
  if (dialStatus === "completed" || dialStatus === "answered") {
    await admin.from("calls").update({
      status: "completed",
      result: "answered",
      ended_at: new Date().toISOString(),
      duration_seconds:
        Number(params.DialCallDuration || params.CallDuration || 0) || null,
    }).eq("id", callId);
    return xml("<Hangup/>");
  }
  if (context.call.direction === "outgoing") {
    await admin.from("calls").update({
      status: dialStatus,
      result: dialStatus,
      ended_at: new Date().toISOString(),
    }).eq("id", callId);
    return xml("<Hangup/>");
  }
  const { data: refreshed } = await admin.from("calls").select("*").eq(
    "id",
    callId,
  ).single();
  return await nextRecipient(refreshed, context.number);
}

async function handleStatus(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const callId = url.searchParams.get("callId");
  const attemptId = url.searchParams.get("attemptId");
  if (!callId) return empty(400);
  const context = await callContext(callId);
  if (
    !context ||
    !await verifySignature(req, params, context.call.organization_id)
  ) return empty(403);
  const status = voiceAdapter.normalizeStatus(params.CallStatus);
  if (!canApplyCallStatus(context.call.status, status)) return empty();
  if (attemptId) {
    const { data: current } = await admin.from("call_attempts").select("status")
      .eq("id", attemptId).eq("call_id", callId).maybeSingle();
    if (current && !canApplyCallStatus(current.status, status)) return empty();
  }
  const patch: Record<string, unknown> = {
    status,
    provider_call_sid: params.CallSid || null,
  };
  if (status === "in-progress" || status === "answered") {
    patch.answered_at = new Date().toISOString();
  }
  if (
    ["completed", "busy", "no-answer", "failed", "canceled"].includes(status)
  ) {
    patch.ended_at = new Date().toISOString();
    patch.duration_seconds = Number(params.CallDuration || 0) || null;
  }
  if (attemptId) {
    await admin.from("call_attempts").update(patch).eq("id", attemptId).eq(
      "call_id",
      callId,
    );
  }
  if (status === "in-progress" || status === "answered") {
    const { data: attempt } = attemptId
      ? await admin.from("call_attempts").select("user_id").eq("id", attemptId)
        .maybeSingle()
      : { data: null };
    await admin.from("calls").update({
      status: "in-progress",
      answered_at: new Date().toISOString(),
      answered_by_user_id: attempt?.user_id ??
        context.call.initiated_by_user_id,
      user_id: attempt?.user_id ?? context.call.user_id,
    }).eq("id", callId);
  }
  if (isTerminalCallStatus(status) && attemptId) {
    const { data: endedAttempt } = await admin.from("call_attempts").select(
      "user_id",
    )
      .eq("id", attemptId).eq("call_id", callId).maybeSingle();
    if (endedAttempt?.user_id) {
      await admin.from("telephony_presence").update({ active_call_id: null })
        .eq("organization_id", context.call.organization_id)
        .eq("user_id", endedAttempt.user_id).eq("active_call_id", callId);
    }
  }
  return empty();
}

async function handleRecording(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const callId = url.searchParams.get("callId");
  const attemptId = url.searchParams.get("attemptId");
  if (!callId || !params.RecordingSid || !params.RecordingUrl) return empty();
  const context = await callContext(callId);
  if (
    !context ||
    !await verifySignature(req, params, context.call.organization_id)
  ) return empty(403);
  await admin.from("call_recordings").upsert({
    organization_id: context.call.organization_id,
    call_id: callId,
    call_attempt_id: attemptId || null,
    recording_sid: params.RecordingSid,
    recording_url: voiceAdapter.recordingMediaUrl(params.RecordingUrl),
    duration_seconds: Number(params.RecordingDuration || 0) || null,
  }, { onConflict: "recording_sid" });
  return empty();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "POST") return empty(405);
  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop() ?? "voice";
  try {
    const params = await paramsOf(req);
    if (route === "voice" || route === "telephony-webhook") {
      return await handleVoice(req, params);
    }
    if (route === "route") return await handleRoute(req, params, url);
    if (route === "status") return await handleStatus(req, params, url);
    if (route === "recording") return await handleRecording(req, params, url);
    return empty(404);
  } catch (error) {
    console.error("[telephony-webhook] unhandled", error);
    return empty(500);
  }
});
