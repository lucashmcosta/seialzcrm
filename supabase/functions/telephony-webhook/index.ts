// jsr (Deno-nativo) em vez de npm: reduz o cold start da function — o npm:@supabase
// carrega um grafo de polyfills pesado a cada boot. Mesma API. (Recomendação do Supabase
// p/ edge functions; já usado por transcribe-audio/integration-worker/etc.)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import {
  escapeXml,
  normalizeE164BR,
  TwilioVoiceAdapter,
  twilioVoiceIdentity,
} from "../_shared/telephony/twilio.ts";
import { resolveContactIngressIdentity } from "../_shared/registry/ingress.ts";
import {
  canApplyCallStatus,
  isTerminalCallStatus,
  telephonyAttemptLimit,
} from "../_shared/telephony/routing.ts";
import {
  deleteTwilioQueue,
  twilioAccountUrl,
  twilioApiContext,
  twilioRequest,
  updateTwilioCall,
} from "../_shared/telephony/twilio-api.ts";
import {
  canApplyTransferEvent,
  transferBridgeOutcome,
  transferOwnsOriginalDial,
} from "../_shared/telephony/transfer.ts";

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

// Música de espera do cliente durante a transferência, em loop infinito.
// Espelha o DivusApp (waitUrl com holdmusic contínua). Configurável via env;
// default = twimlet holdmusic (ambiente), que o Twilio busca server-side.
// Se a URL for um .mp3/.wav, toca via <Play loop="0">; senão trata como TwiML
// (twimlet) e redireciona.
const HOLD_MUSIC_URL = Deno.env.get("TELEPHONY_HOLD_MUSIC_URL") ||
  "http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient";
function holdMusicTwiml(): string {
  return /\.(mp3|wav)(\?|$)/i.test(HOLD_MUSIC_URL)
    ? `<Play loop="0">${escapeXml(HOLD_MUSIC_URL)}</Play>`
    : `<Redirect>${escapeXml(HOLD_MUSIC_URL)}</Redirect>`;
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

// deno-lint-ignore no-explicit-any
async function transferContext(
  transferId: string,
): Promise<{ transfer: any; call: any; number: any } | null> {
  const { data: transfer } = await admin.from("call_transfers").select("*").eq(
    "id",
    transferId,
  ).maybeSingle();
  if (!transfer) return null;
  const context = await callContext(transfer.call_id);
  return context ? { transfer, ...context } : null;
}

// deno-lint-ignore no-explicit-any
async function recordTransferEvent(
  transfer: any,
  key: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await admin.from("call_transfer_events").upsert({
    organization_id: transfer.organization_id,
    transfer_id: transfer.id,
    provider: "twilio",
    provider_event_key: key,
    event_type: type,
    payload,
  }, { onConflict: "provider,provider_event_key" });
}

// deno-lint-ignore no-explicit-any
async function setUserPresence(transfer: any, userId: string, active: boolean) {
  let query = admin.from("telephony_presence").update({
    active_call_id: active ? transfer.call_id : null,
    last_seen_at: new Date().toISOString(),
  }).eq("organization_id", transfer.organization_id).eq("user_id", userId);
  query = active
    ? query.is("active_call_id", null)
    : query.eq("active_call_id", transfer.call_id);
  await query;
}

function transferCycle(url: URL, fallback: number): number {
  const raw = url.searchParams.get("cycle");
  // Pre-hardening callbacks did not carry a cycle. They are safe only for the
  // original consultation; after a re-consult they must be treated as stale.
  if (!raw) return fallback === 1 ? 1 : 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Delayed Twilio callbacks are expected. They may update their own leg/event,
// but only the currently owning transfer cycle may mutate the shared call.
// deno-lint-ignore no-explicit-any
async function ownsCurrentTransferCycle(context: any, cycle: number) {
  if (Number(context.transfer.consultation_sequence || 1) !== cycle) {
    return false;
  }
  const { data: call } = await admin.from("calls").select("active_transfer_id")
    .eq("id", context.call.id).maybeSingle();
  return canApplyTransferEvent({
    transferId: context.transfer.id,
    activeTransferId: call?.active_transfer_id,
    currentCycle: Number(context.transfer.consultation_sequence || 1),
    eventCycle: cycle,
  });
}

// deno-lint-ignore no-explicit-any
async function renderTransferBridge(
  context: { transfer: any; call: any; number: any },
  actor: "initiator" | "target",
  finish: boolean,
): Promise<Response> {
  const { transfer, call, number } = context;
  const userId = actor === "target"
    ? transfer.target_user_id
    : transfer.initiated_by_user_id;
  const { count } = await admin.from("call_transfer_legs").select("id", {
    count: "exact",
    head: true,
  })
    .eq("transfer_id", transfer.id).eq("role", "customer_bridge");
  const sequence = (count ?? 0) + 1;
  const { data: leg } = await admin.from("call_transfer_legs").insert({
    organization_id: transfer.organization_id,
    transfer_id: transfer.id,
    call_id: transfer.call_id,
    user_id: userId,
    role: "customer_bridge",
    sequence,
    status: "queued",
  }).select("id").single();
  await recordTransferEvent(
    transfer,
    `bridge:${transfer.id}:${actor}:${sequence}`,
    "customer_bridge_started",
    { actor, userId, sequence },
  );
  const actionUrl = escapeXml(
    `${BASE_URL}/transfer-bridge-result?transferId=${transfer.id}&legId=${
      leg?.id ?? ""
    }&actor=${actor}&cycle=${transfer.consultation_sequence || 1}`,
  );
  const recordingUrl = escapeXml(
    `${BASE_URL}/recording?callId=${call.id}&transferLegId=${leg?.id ?? ""}`,
  );
  const record = number.recording_enabled
    ? ` record="record-from-answer-dual" recordingStatusCallback="${recordingUrl}"`
    : "";
  const connectedUrl = escapeXml(
    `${BASE_URL}/transfer-bridge-connected?transferId=${transfer.id}&legId=${
      leg?.id ?? ""
    }&actor=${actor}&finish=${finish ? "1" : "0"}&cycle=${
      transfer.consultation_sequence || 1
    }`,
  );
  return xml(
    `<Dial action="${actionUrl}"${record}><Queue url="${connectedUrl}" method="POST">${
      escapeXml(transfer.queue_name)
    }</Queue></Dial>`,
  );
}

// deno-lint-ignore no-explicit-any
async function createTransferRecoveryCall(
  context: { transfer: any; call: any; number: any },
  actor: "initiator" | "target",
) {
  const userId = actor === "target"
    ? context.transfer.target_user_id
    : context.transfer.initiated_by_user_id;
  const identity = twilioVoiceIdentity(
    userId,
    context.transfer.organization_id,
  );
  const twilio = await twilioApiContext(
    admin,
    context.transfer.organization_id,
  );
  return await twilioRequest<{ sid: string }>(
    twilio,
    twilioAccountUrl(twilio, "Calls.json"),
    {
      method: "POST",
      form: {
        To: `client:${identity}`,
        From: context.number.phone_number,
        Url:
          `${BASE_URL}/transfer-bridge?transferId=${context.transfer.id}&actor=${actor}&cycle=${
            context.transfer.consultation_sequence || 1
          }`,
        Method: "POST",
        Timeout: 15,
        StatusCallback:
          `${BASE_URL}/transfer-recovery-status?transferId=${context.transfer.id}&actor=${actor}&cycle=${
            context.transfer.consultation_sequence || 1
          }`,
        StatusCallbackMethod: "POST",
        StatusCallbackEvent: "completed",
      },
    },
  );
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
async function ensureMissedCallTask(call: any, number: any) {
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
  if (!owner) {
    console.error("[telephony-webhook] no_fallback_owner", {
      callId: call.id,
      numberId: number.id,
    });
  }
  return taskId;
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
  const taskId = await ensureMissedCallTask(call, number);
  await admin.from("calls").update({
    status: "no-answer",
    result: "missed",
    ended_at: new Date().toISOString(),
    missed_task_id: taskId,
  }).eq("id", call.id);
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
  const identity = twilioVoiceIdentity(attempt.user_id, call.organization_id);
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
  if (error) {
    console.error("[telephony-webhook] recipient_claim_failed", {
      callId: call.id,
      numberId: number.id,
      code: error.code,
      message: error.message,
    });
    return await fallback(call, number);
  }
  if (!data?.[0]?.user_id) {
    console.warn("[telephony-webhook] no_eligible_recipient", {
      callId: call.id,
      numberId: number.id,
      triedCount: tried.length,
    });
    return await fallback(call, number);
  }
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
  }).select("id, user_id, attempt_number").single();
  if (attemptError || !attempt) {
    console.error("[telephony-webhook] attempt_create_failed", {
      callId: call.id,
      numberId: number.id,
      userId: recipient.user_id,
      code: attemptError?.code,
      message: attemptError?.message,
    });
    await admin.from("telephony_presence").update({ active_call_id: null })
      .eq("organization_id", call.organization_id)
      .eq("user_id", recipient.user_id)
      .eq("active_call_id", call.id);
    return await fallback(call, number);
  }

  try {
    return renderAttempt(call, number, attempt);
  } catch (error) {
    console.error("[telephony-webhook] attempt_render_failed", {
      callId: call.id,
      attemptId: attempt.id,
      userId: attempt.user_id,
      message: error instanceof Error ? error.message : String(error),
    });
    await admin.from("call_attempts").update({
      status: "failed",
      ended_at: new Date().toISOString(),
      failure_reason: "twiml_render_failed",
    }).eq("id", attempt.id).eq("call_id", call.id);
    await admin.from("telephony_presence").update({ active_call_id: null })
      .eq("organization_id", call.organization_id)
      .eq("user_id", attempt.user_id)
      .eq("active_call_id", call.id);
    return await fallback(call, number);
  }
}

async function handleTransferVoice(
  req: Request,
  params: Record<string, string>,
): Promise<Response | null> {
  if (
    !params.TransferId || !["consult", "retrieve"].includes(params.Mode || "")
  ) return null;
  const context = await transferContext(params.TransferId);
  if (!context || context.call.id !== params.CallId) {
    return message("Transferência inválida.");
  }
  if (!await verifySignature(req, params, context.transfer.organization_id)) {
    return empty(403);
  }
  const cycle = Number(params.ConsultationSequence || 1);
  if (
    cycle !== Number(context.transfer.consultation_sequence || 1) ||
    !await ownsCurrentTransferCycle(context, cycle)
  ) {
    await recordTransferEvent(
      context.transfer,
      `stale-voice:${params.CallSid || crypto.randomUUID()}:${cycle}`,
      "stale_consultation_voice_ignored",
      { cycle, currentCycle: context.transfer.consultation_sequence },
    );
    return xml("<Hangup/>");
  }
  if (["completed", "canceled", "failed"].includes(context.transfer.state)) {
    return message("Transferência encerrada.");
  }
  if (params.Mode === "retrieve") {
    return await renderTransferBridge(
      context,
      "initiator",
      params.FinishTransfer === "1",
    );
  }
  if (params.TargetUserId !== context.transfer.target_user_id) {
    return empty(403);
  }
  const { count } = await admin.from("call_transfer_legs").select("id", {
    count: "exact",
    head: true,
  })
    .eq("transfer_id", context.transfer.id).eq("role", "consult_initiator");
  const sequence = (count ?? 0) + 1;
  const { data: initiatorLeg } = await admin.from("call_transfer_legs").insert({
    organization_id: context.transfer.organization_id,
    transfer_id: context.transfer.id,
    call_id: context.call.id,
    user_id: context.transfer.initiated_by_user_id,
    role: "consult_initiator",
    sequence,
    provider_call_sid: params.CallSid,
    status: "in-progress",
    answered_at: new Date().toISOString(),
  }).select("id").single();
  await admin.from("call_transfers").update({
    state: "consult_ringing",
    consult_parent_call_sid: params.CallSid,
    version: context.transfer.version + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", context.transfer.id)
    .eq("consultation_sequence", cycle)
    .in("state", ["customer_queued", "consult_ringing"]);
  await admin.from("calls").update({ transfer_status: "consult_ringing" }).eq(
    "id",
    context.call.id,
  ).eq("active_transfer_id", context.transfer.id);
  const { data: initiator } = await admin.from("users").select("full_name").eq(
    "id",
    context.transfer.initiated_by_user_id,
  ).maybeSingle();
  const statusUrl = escapeXml(
    `${BASE_URL}/transfer-leg-status?transferId=${context.transfer.id}&sequence=${sequence}&cycle=${cycle}`,
  );
  const actionUrl = escapeXml(
    `${BASE_URL}/transfer-consult-result?transferId=${context.transfer.id}&sequence=${sequence}&initiatorLegId=${
      initiatorLeg?.id ?? ""
    }&cycle=${cycle}`,
  );
  const identity = twilioVoiceIdentity(
    context.transfer.target_user_id,
    context.transfer.organization_id,
  );
  const customerAddress = context.call.direction === "outgoing"
    ? context.call.to_number
    : context.call.from_number;
  return xml(
    `<Dial timeout="15" action="${actionUrl}"><Client statusCallback="${statusUrl}" statusCallbackEvent="initiated ringing answered completed"><Identity>${
      escapeXml(identity)
    }</Identity><Parameter name="CallId" value="${
      escapeXml(context.call.id)
    }"/><Parameter name="TransferId" value="${
      escapeXml(context.transfer.id)
    }"/><Parameter name="ConsultationSequence" value="${cycle}"/><Parameter name="TransferRole" value="consult"/><Parameter name="CustomerFrom" value="${
      escapeXml(customerAddress || "")
    }"/><Parameter name="InitiatorName" value="${
      escapeXml(initiator?.full_name || "Colega")
    }"/></Client></Dial>`,
  );
}

async function handleTransferLegStatus(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const sequence = Number(url.searchParams.get("sequence") || 1);
  if (!transferId || !params.CallSid) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  const status = voiceAdapter.normalizeStatus(params.CallStatus);
  const terminal = isTerminalCallStatus(status);
  await admin.from("call_transfer_legs").upsert({
    organization_id: context.transfer.organization_id,
    transfer_id: transferId,
    call_id: context.call.id,
    user_id: context.transfer.target_user_id,
    role: "consult_target",
    sequence,
    provider_call_sid: params.CallSid,
    status,
    answered_at: ["answered", "in-progress"].includes(status)
      ? new Date().toISOString()
      : undefined,
    ended_at: terminal ? new Date().toISOString() : undefined,
    duration_seconds: terminal
      ? Number(params.CallDuration || 0) || null
      : undefined,
    failure_reason: terminal && status !== "completed" ? status : null,
  }, { onConflict: "transfer_id,role,sequence" });
  await recordTransferEvent(
    context.transfer,
    `leg:${params.CallSid}:${status}:${params.SequenceNumber || "0"}`,
    `consult_target_${status}`,
    { callSid: params.CallSid, status, sequence },
  );
  const cycle = transferCycle(
    url,
    Number(context.transfer.consultation_sequence || 1),
  );
  if (!await ownsCurrentTransferCycle(context, cycle)) {
    await recordTransferEvent(
      context.transfer,
      `stale-leg:${params.CallSid}:${status}:${cycle}`,
      "stale_consultation_leg_ignored",
      { callSid: params.CallSid, status, sequence, cycle },
    );
    return empty();
  }
  if (["answered", "in-progress"].includes(status)) {
    const { data: transitioned } = await admin.from("call_transfers").update({
      state: "consulting",
      consult_target_call_sid: params.CallSid,
      target_answered_at: new Date().toISOString(),
      version: context.transfer.version + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", transferId).eq("consultation_sequence", cycle)
      .in("state", ["customer_queued", "consult_ringing"])
      .select("id").maybeSingle();
    if (transitioned) {
      await admin.from("calls").update({ transfer_status: "consulting" }).eq(
        "id",
        context.call.id,
      ).eq("active_transfer_id", transferId);
    }
  }
  if (
    terminal && ["consulting"].includes(
      context.transfer.state,
    )
  ) {
    // Recovery only applies once the target ANSWERED (state `consulting`). If
    // the target never answers (`consult_ringing`), we must NOT touch state
    // here: the parent `<Dial action>` (handleTransferConsultResult) already
    // returns the initiator to the parked customer. Racing it into
    // `handoff_pending` here made that action hit its guard and `<Hangup/>`,
    // which is exactly why a no-answer never returned to the customer.
    // With the target already answered, if the initiator/browser then
    // disappears the Dial action may never run; after this short race window
    // the target is rung again and connected straight to the waiting customer.
    await new Promise((resolve) => setTimeout(resolve, 750));
    const pending = await transferContext(transferId);
    if (
      pending && await ownsCurrentTransferCycle(pending, cycle) &&
      ["consulting"].includes(
        pending.transfer.state,
      )
    ) {
      if (pending.transfer.consult_parent_call_sid) {
        const twilio = await twilioApiContext(
          admin,
          pending.transfer.organization_id,
        );
        const parent = await twilioRequest<{ status?: string }>(
          twilio,
          twilioAccountUrl(
            twilio,
            `Calls/${pending.transfer.consult_parent_call_sid}.json`,
          ),
        ).catch(() => null);
        if (
          parent && ["queued", "ringing", "in-progress"].includes(
            parent.status || "",
          )
        ) return empty();
      }
      await admin.from("call_transfers").update({
        state: "handoff_pending",
        failure_reason: "initiator_disconnected_during_consult",
        version: pending.transfer.version + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", transferId).eq("state", "consulting")
        .eq("consultation_sequence", cycle);
      await admin.from("calls").update({ transfer_status: "handoff_pending" })
        .eq("id", pending.call.id).eq("active_transfer_id", transferId);
      try {
        await createTransferRecoveryCall(pending, "target");
      } catch (error) {
        console.error("[telephony-webhook] target_recovery_call_failed", error);
        await admin.from("call_transfers").update({
          state: "returning_to_customer",
          failure_reason: "target_recovery_call_failed",
          version: pending.transfer.version + 2,
          updated_at: new Date().toISOString(),
        }).eq("id", transferId).eq("consultation_sequence", cycle);
        await createTransferRecoveryCall(pending, "initiator").catch(() =>
          undefined
        );
      }
    }
  }
  return empty();
}

async function handleTransferConsultResult(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const initiatorLegId = url.searchParams.get("initiatorLegId");
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  if (initiatorLegId) {
    await admin.from("call_transfer_legs").update({
      status: params.DialCallStatus || "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: Number(params.DialCallDuration || 0) || null,
    }).eq("id", initiatorLegId).eq("transfer_id", transferId);
  }
  const refreshed = await transferContext(transferId);
  if (!refreshed) return empty(404);
  const cycle = transferCycle(
    url,
    Number(refreshed.transfer.consultation_sequence || 1),
  );
  if (!await ownsCurrentTransferCycle(refreshed, cycle)) {
    await recordTransferEvent(
      refreshed.transfer,
      `stale-consult-result:${params.CallSid || initiatorLegId}:${cycle}`,
      "stale_consultation_result_ignored",
      { cycle, dialStatus: params.DialCallStatus || null },
    );
    return xml("<Hangup/>");
  }
  if (
    [
      "handoff_pending",
      "completed",
      "returning_to_customer",
      "canceled",
      "failed",
    ].includes(refreshed.transfer.state)
  ) {
    return xml("<Hangup/>");
  }
  await admin.from("call_transfers").update({
    state: "returning_to_customer",
    failure_reason: `consult_${params.DialCallStatus || "ended"}`,
    version: refreshed.transfer.version + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", transferId).eq("consultation_sequence", cycle);
  await admin.from("calls").update({ transfer_status: "returning_to_customer" })
    .eq("id", refreshed.call.id).eq("active_transfer_id", transferId);
  await setUserPresence(
    refreshed.transfer,
    refreshed.transfer.target_user_id,
    false,
  );
  return await renderTransferBridge(
    {
      ...refreshed,
      transfer: { ...refreshed.transfer, state: "returning_to_customer" },
    },
    "initiator",
    false,
  );
}

async function handleTransferBridge(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const actor = url.searchParams.get("actor") === "target"
    ? "target"
    : "initiator";
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  const cycle = transferCycle(
    url,
    Number(context.transfer.consultation_sequence || 1),
  );
  if (!await ownsCurrentTransferCycle(context, cycle)) return xml("<Hangup/>");
  return await renderTransferBridge(
    context,
    actor,
    url.searchParams.get("finish") === "1",
  );
}

async function handleTransferBridgeConnected(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const legId = url.searchParams.get("legId");
  const actor = url.searchParams.get("actor") === "target"
    ? "target"
    : "initiator";
  const finish = url.searchParams.get("finish") === "1";
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  const cycle = transferCycle(
    url,
    Number(context.transfer.consultation_sequence || 1),
  );
  if (!await ownsCurrentTransferCycle(context, cycle)) {
    await recordTransferEvent(
      context.transfer,
      `stale-bridge-connected:${params.CallSid || legId}:${cycle}`,
      "stale_customer_bridge_ignored",
      { actor, cycle },
    );
    return xml("");
  }
  const userId = actor === "target"
    ? context.transfer.target_user_id
    : context.transfer.initiated_by_user_id;
  const { state: nextState, result } = transferBridgeOutcome(actor, finish);
  if (legId) {
    await admin.from("call_transfer_legs").update({
      status: "in-progress",
      answered_at: new Date().toISOString(),
    }).eq("id", legId).eq("transfer_id", transferId);
  }
  const { data: transitioned } = await admin.from("call_transfers").update({
    state: nextState,
    result,
    active_user_id: userId,
    completed_at: actor === "target" || finish
      ? new Date().toISOString()
      : null,
    version: context.transfer.version + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", transferId).in("state", [
    "returning_to_customer",
    "handoff_pending",
  ]).eq("consultation_sequence", cycle).select("id").maybeSingle();
  if (!transitioned) return xml("");
  await admin.from("calls").update({
    current_agent_user_id: userId,
    transfer_status: nextState,
    status: "in-progress",
    active_transfer_id: nextState === "completed" || nextState === "canceled"
      ? null
      : transferId,
  }).eq("id", context.call.id).eq("active_transfer_id", transferId);
  if (actor === "target") {
    await setUserPresence(
      context.transfer,
      context.transfer.initiated_by_user_id,
      false,
    );
    await setUserPresence(
      context.transfer,
      context.transfer.target_user_id,
      true,
    );
  } else {
    await setUserPresence(
      context.transfer,
      context.transfer.target_user_id,
      false,
    );
    await setUserPresence(
      context.transfer,
      context.transfer.initiated_by_user_id,
      true,
    );
  }
  await admin.rpc("release_telephony_transfer_reservations", {
    _transfer_id: transferId,
  });
  await recordTransferEvent(
    context.transfer,
    `bridge-connected:${transferId}:${actor}:${legId || params.CallSid}`,
    "customer_bridge_connected",
    { actor, userId, queueSid: params.QueueSid || null },
  );
  return xml("");
}

async function handleTransferBridgeResult(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const legId = url.searchParams.get("legId");
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  if (legId) {
    await admin.from("call_transfer_legs").update({
      status: params.DialCallStatus || "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: Number(params.DialCallDuration || 0) || null,
    }).eq("id", legId).eq("transfer_id", transferId);
  }
  const refreshed = await transferContext(transferId);
  if (!refreshed) return empty();
  const cycle = transferCycle(
    url,
    Number(refreshed.transfer.consultation_sequence || 1),
  );
  if (cycle !== Number(refreshed.transfer.consultation_sequence || 1)) {
    await recordTransferEvent(
      refreshed.transfer,
      `stale-bridge-result:${params.CallSid || legId}:${cycle}`,
      "stale_customer_bridge_result_ignored",
      { cycle, dialStatus: params.DialCallStatus || null },
    );
    return xml("<Hangup/>");
  }
  const { data: activeOtherTransfer } = await admin.from("call_transfers")
    .select("id").eq("call_id", refreshed.call.id).neq("id", transferId)
    .not("state", "in", "(completed,canceled,failed)").limit(1).maybeSingle();
  if (activeOtherTransfer) {
    // A subsequent transfer intentionally ends the previous customer bridge.
    // Its delayed Dial callback must not complete the shared business call or
    // release the new transfer's reservations.
    try {
      const twilio = await twilioApiContext(
        admin,
        refreshed.transfer.organization_id,
      );
      await deleteTwilioQueue(twilio, refreshed.transfer.provider_queue_sid);
      await admin.from("call_transfers").update({
        provider_queue_sid: null,
        updated_at: new Date().toISOString(),
      }).eq("id", transferId);
    } catch (error) {
      console.warn("[telephony-webhook] previous_queue_cleanup_failed", error);
    }
    return xml("<Hangup/>");
  }
  const ownsSharedCall = refreshed.call.active_transfer_id === transferId;
  if (
    ["parking_customer", "customer_queued", "consult_ringing", "consulting"]
      .includes(refreshed.transfer.state)
  ) {
    return xml("<Hangup/>");
  }
  if (
    ["returning_to_customer", "handoff_pending"].includes(
      refreshed.transfer.state,
    )
  ) {
    await admin.from("call_transfers").update({
      state: "failed",
      result: "customer_bridge_failed",
      failure_reason: params.DialCallStatus || "queue_member_unavailable",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", transferId);
    if (!ownsSharedCall) return xml("<Hangup/>");
    await admin.from("calls").update({
      status: "completed",
      result: "customer_hangup",
      transfer_status: "failed",
      ended_at: new Date().toISOString(),
      active_transfer_id: null,
    }).eq("id", refreshed.call.id).eq("active_transfer_id", transferId);
    await admin.rpc("release_telephony_transfer_reservations", {
      _transfer_id: transferId,
    });
    return xml("<Hangup/>");
  }
  if (
    !ownsSharedCall &&
    !["completed", "canceled", "failed"].includes(refreshed.transfer.state)
  ) return xml("<Hangup/>");
  await admin.from("calls").update({
    status: "completed",
    result: refreshed.transfer.result || "answered",
    transfer_status: refreshed.transfer.state,
    ended_at: new Date().toISOString(),
    active_transfer_id: null,
  }).eq("id", refreshed.call.id).or(
    `active_transfer_id.eq.${transferId},active_transfer_id.is.null`,
  );
  await admin.rpc("release_telephony_transfer_reservations", {
    _transfer_id: transferId,
  });
  try {
    const twilio = await twilioApiContext(
      admin,
      refreshed.transfer.organization_id,
    );
    await deleteTwilioQueue(twilio, refreshed.transfer.provider_queue_sid);
    await admin.from("call_transfers").update({
      provider_queue_sid: null,
      updated_at: new Date().toISOString(),
    }).eq("id", transferId);
  } catch (error) {
    console.warn("[telephony-webhook] transfer_queue_cleanup_failed", error);
  }
  return xml("<Hangup/>");
}

async function handleTransferRecoveryStatus(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  const actor = url.searchParams.get("actor") === "target"
    ? "target"
    : "initiator";
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  const cycle = transferCycle(
    url,
    Number(context.transfer.consultation_sequence || 1),
  );
  if (!await ownsCurrentTransferCycle(context, cycle)) return empty();
  if (
    ["completed", "canceled", "failed", "with_customer"].includes(
      context.transfer.state,
    )
  ) {
    return empty();
  }
  if (actor === "target" && context.transfer.state === "handoff_pending") {
    await admin.from("call_transfers").update({
      state: "returning_to_customer",
      failure_reason: `target_recovery_${params.CallStatus || "no_answer"}`,
      version: context.transfer.version + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", transferId).eq("consultation_sequence", cycle);
    await admin.from("calls").update({
      transfer_status: "returning_to_customer",
    })
      .eq("id", context.call.id).eq("active_transfer_id", transferId);
    await createTransferRecoveryCall(context, "initiator").catch((error) =>
      console.error("[telephony-webhook] initiator_recovery_call_failed", error)
    );
    return empty();
  }
  if (
    actor === "initiator" && context.transfer.state === "returning_to_customer"
  ) {
    const twilio = await twilioApiContext(
      admin,
      context.transfer.organization_id,
    );
    await updateTwilioCall(twilio, context.transfer.customer_call_sid, {
      twiml: `<Response><Say language="pt-BR">${
        escapeXml(
          context.number.fallback_message ||
            "Não foi possível concluir a transferência. Retornaremos em breve.",
        )
      }</Say><Hangup/></Response>`,
    }).catch(() => undefined);
    const missedTaskId = await ensureMissedCallTask(
      context.call,
      context.number,
    );
    await admin.from("call_transfers").update({
      state: "failed",
      result: "agents_unavailable",
      failure_reason: `initiator_recovery_${params.CallStatus || "no_answer"}`,
      version: context.transfer.version + 1,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", transferId);
    await admin.from("calls").update({
      status: "failed",
      result: "transfer_failed",
      transfer_status: "failed",
      missed_task_id: missedTaskId,
      ended_at: new Date().toISOString(),
      active_transfer_id: null,
    }).eq("id", context.call.id).eq("active_transfer_id", transferId);
    await admin.rpc("release_telephony_transfer_reservations", {
      _transfer_id: transferId,
    });
    await deleteTwilioQueue(twilio, context.transfer.provider_queue_sid).catch(
      () => undefined,
    );
  }
  return empty();
}

async function handleTransferWait(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  // waitUrl do cliente em espera. NUNCA devolver <Hangup/> por ciclo: enquanto o
  // transfer estiver ativo, o cliente segue em espera (música em loop), qualquer
  // que seja o ciclo de consulta em andamento. Só encerra se o transfer já chegou
  // a estado terminal. (Regra herdada do DivusApp §9.3: a waitUrl/queue-result
  // nunca devem devolver <Hangup/> — foi o que derrubava a perna do cliente.)
  if (["completed", "canceled", "failed"].includes(context.transfer.state)) {
    return xml("<Hangup/>");
  }
  // Captura o SID da fila que o <Enqueue> criou sob demanda (o hold não cria a
  // Queue explicitamente, para poupar 1 REST do Twilio). Idempotente (só quando
  // ainda nulo) e best-effort — necessário apenas para o cleanup (deleteTwilioQueue);
  // uma falha aqui não pode afetar a música de espera.
  if (params.QueueSid) {
    try {
      await admin.from("call_transfers")
        .update({ provider_queue_sid: params.QueueSid })
        .eq("id", context.transfer.id)
        .is("provider_queue_sid", null);
    } catch { /* sem impacto no áudio */ }
  }
  return xml(holdMusicTwiml());
}

async function handleTransferQueueResult(
  req: Request,
  params: Record<string, string>,
  url: URL,
): Promise<Response> {
  const transferId = url.searchParams.get("transferId");
  if (!transferId) return empty(400);
  const context = await transferContext(transferId);
  if (
    !context ||
    !await verifySignature(req, params, context.transfer.organization_id)
  ) return empty(403);
  // Captura o SID da fila que o <Enqueue> criou sob demanda (a waitUrl agora
  // aponta DIRETO pra música e não passa mais pela nossa transfer-wait).
  // Idempotente/best-effort — só serve pro cleanup (deleteTwilioQueue).
  if (params.QueueSid) {
    try {
      await admin.from("call_transfers")
        .update({ provider_queue_sid: params.QueueSid })
        .eq("id", context.transfer.id).is("provider_queue_sid", null);
    } catch { /* sem impacto no fluxo */ }
  }
  const result = params.QueueResult || "unknown";
  const cycle = transferCycle(
    url,
    Number(context.transfer.consultation_sequence || 1),
  );
  await recordTransferEvent(
    context.transfer,
    `queue:${transferId}:${cycle}:${result}:${
      params.SequenceNumber || params.CallStatus || "0"
    }`,
    "queue_result",
    { result, queueSid: params.QueueSid || null, cycle },
  );
  if (!await ownsCurrentTransferCycle(context, cycle)) {
    await recordTransferEvent(
      context.transfer,
      `stale-queue:${transferId}:${cycle}:${params.SequenceNumber || "0"}`,
      "stale_queue_result_ignored",
      { result, cycle },
    );
    // no-op (não <Hangup/>): resultado de fila de ciclo antigo não deve derrubar
    // a perna do cliente/consultor. (DivusApp §9.3)
    return xml("");
  }
  if (["hangup", "error", "queue-full", "system-error"].includes(result)) {
    await admin.from("call_transfers").update({
      state: "failed",
      result: "customer_left_queue",
      failure_reason: result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", transferId).not("state", "in", "(completed,canceled,failed)");
    await admin.from("calls").update({
      status: "completed",
      result: "customer_hangup",
      transfer_status: "failed",
      ended_at: new Date().toISOString(),
      active_transfer_id: null,
    }).eq("id", context.call.id).eq("active_transfer_id", transferId);
    await admin.rpc("release_telephony_transfer_reservations", {
      _transfer_id: transferId,
    });
    const twilio = await twilioApiContext(
      admin,
      context.transfer.organization_id,
    );
    for (
      const sid of [
        context.transfer.consult_parent_call_sid,
        context.transfer.consult_target_call_sid,
        // Perna do agente mantida VIVA no hold (keepalive): se o cliente desligar
        // na espera, derruba já a perna do agente (senão ela só cairia no próximo
        // tick do loop de keepalive, ~60s depois).
        context.call.call_sid,
      ]
    ) {
      if (sid) {
        await updateTwilioCall(twilio, sid, { status: "completed" }).catch(() =>
          undefined
        );
      }
    }
    await deleteTwilioQueue(twilio, context.transfer.provider_queue_sid).catch(
      () => undefined,
    );
  }
  // no-op: o encerramento real (se houver) já foi feito acima via REST. A TwiML
  // de action da fila nunca deve devolver <Hangup/> — poderia matar uma perna que
  // acabou de ser bridada. (DivusApp §9.3)
  return xml("");
}

async function handleVoice(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const transferResponse = await handleTransferVoice(req, params);
  if (transferResponse) return transferResponse;
  const callId = params.CallId;
  if (callId) {
    const context = await callContext(callId);
    if (!context) return message("Não foi possível iniciar a chamada.");
    // sig-check e flag v2 são leituras independentes (dependem só do org) → em
    // paralelo em vez de 2 round-trips em série no caminho crítico da discagem. A
    // assinatura ainda BARRA antes de qualquer escrita (checada logo abaixo).
    const [signatureOk, v2Enabled] = await Promise.all([
      verifySignature(req, params, context.call.organization_id),
      telephonyV2Enabled(admin, context.call.organization_id),
    ]);
    if (!signatureOk) return empty(403);
    if (!v2Enabled) return empty(404);
    if (
      context.call.direction !== "outgoing" ||
      !["queued", "initiated", "ringing"].includes(context.call.status)
    ) {
      return message("Chamada inválida ou já processada.");
    }
    const parentSid = params.CallSid;
    // As duas escritas (call_attempts + calls) são independentes → Promise.all. O
    // attempt.id é usado no query string da TwiML abaixo, por isso guardamos o retorno.
    const [{ data: attempt }] = await Promise.all([
      admin.from("call_attempts").upsert({
        organization_id: context.call.organization_id,
        call_id: context.call.id,
        user_id: context.call.initiated_by_user_id,
        attempt_number: 1,
        provider: "twilio",
        provider_call_sid: parentSid,
        status: "initiated",
      }, { onConflict: "call_id,attempt_number" }).select("id").single(),
      admin.from("calls").update({
        call_sid: parentSid,
        provider_parent_call_id: parentSid,
        status: "initiated",
      }).eq("id", context.call.id),
    ]);
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
  const transferIsActive = transferOwnsOriginalDial(
    context.call.transfer_status,
  );
  const { data: currentAttempt } = attemptId
    ? await admin.from("call_attempts").select(
      "user_id, attempt_number, status, ended_at, duration_seconds",
    )
      .eq("id", attemptId).eq("call_id", callId).maybeSingle()
    : { data: null };
  // An out-of-order callback from the original Dial must not complete the
  // business call after the customer has entered the private transfer flow.
  if (transferIsActive) {
    // HOLD: mantém a perna do agente VIVA em vez de encerrar, para o retomar ser
    // instantâneo (o resume redireciona esta MESMA perna pra fila do cliente,
    // sem re-discar). Loop leve de keepalive (Pause + Redirect ao /route) que se
    // auto-encerra quando o estado sai de on_hold: o resume redireciona a perna
    // pra fora deste loop; se o cliente desligar, transfer-queue-result derruba
    // a perna do agente e o próximo tick do loop cai no <Hangup/> abaixo.
    if (context.call.transfer_status === "on_hold") {
      const routeUrl = escapeXml(
        `${BASE_URL}/route?callId=${encodeURIComponent(callId)}${
          attemptId ? `&attemptId=${encodeURIComponent(attemptId)}` : ""
        }`,
      );
      return xml(
        `<Pause length="60"/><Redirect method="POST">${routeUrl}</Redirect>`,
      );
    }
    if (attemptId) {
      await admin.from("call_attempts").update({
        status: dialStatus,
        provider_call_sid: params.DialCallSid || params.CallSid || null,
        ended_at: new Date().toISOString(),
        duration_seconds:
          Number(params.DialCallDuration || params.CallDuration || 0) || null,
      }).eq("id", attemptId).eq("call_id", callId);
    }
    return xml("<Hangup/>");
  }
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
      current_agent_user_id: attempt?.user_id ??
        context.call.initiated_by_user_id,
      user_id: attempt?.user_id ?? context.call.user_id,
    }).eq("id", callId);
  }
  if (
    isTerminalCallStatus(status) && attemptId && !context.call.transfer_status
  ) {
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
  const transferLegId = url.searchParams.get("transferLegId");
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
    call_transfer_leg_id: transferLegId || null,
    segment_type: "customer_agent",
    recording_sid: params.RecordingSid,
    recording_url: voiceAdapter.recordingMediaUrl(params.RecordingUrl),
    duration_seconds: Number(params.RecordingDuration || 0) || null,
  }, { onConflict: "recording_sid" });
  return empty();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  // Rota leve de "warm-ping" (chamada por um cron a cada minuto) para manter a
  // function quente e evitar cold starts (~2-3s) nos callbacks do Twilio.
  // Responde imediatamente, antes de qualquer auth/DB.
  if (new URL(req.url).pathname.endsWith("/warm")) {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") return empty(405);
  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop() ?? "voice";
  try {
    const params = await paramsOf(req);
    // Every Twilio callback is signed. Reject an unsigned request before any
    // route-specific lookup so invalid payloads cannot receive fallback TwiML.
    if (!req.headers.get("x-twilio-signature")) return empty(403);
    if (route === "voice" || route === "telephony-webhook") {
      return await handleVoice(req, params);
    }
    if (route === "route") return await handleRoute(req, params, url);
    if (route === "status") return await handleStatus(req, params, url);
    if (route === "recording") return await handleRecording(req, params, url);
    if (route === "transfer-leg-status") {
      return await handleTransferLegStatus(req, params, url);
    }
    if (route === "transfer-consult-result") {
      return await handleTransferConsultResult(req, params, url);
    }
    if (route === "transfer-bridge") {
      return await handleTransferBridge(req, params, url);
    }
    if (route === "transfer-bridge-connected") {
      return await handleTransferBridgeConnected(req, params, url);
    }
    if (route === "transfer-bridge-result") {
      return await handleTransferBridgeResult(req, params, url);
    }
    if (route === "transfer-recovery-status") {
      return await handleTransferRecoveryStatus(req, params, url);
    }
    if (route === "transfer-wait") {
      return await handleTransferWait(req, params, url);
    }
    if (route === "transfer-queue-result") {
      return await handleTransferQueueResult(req, params, url);
    }
    return empty(404);
  } catch (error) {
    console.error("[telephony-webhook] unhandled", error);
    return empty(500);
  }
});
