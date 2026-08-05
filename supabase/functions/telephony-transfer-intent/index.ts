import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import {
  telephonyTransferEnabled,
  telephonyV2Enabled,
} from "../_shared/telephony/feature-flag.ts";
import { escapeXml, TwilioVoiceAdapter } from "../_shared/telephony/twilio.ts";
import {
  createTwilioQueue,
  deleteTwilioQueue,
  safeTwilioError,
  twilioApiContext,
  updateTwilioCall,
} from "../_shared/telephony/twilio-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const WEBHOOK_BASE = `${SUPABASE_URL}/functions/v1/telephony-webhook`;

// deno-lint-ignore no-explicit-any
async function loadTransferableCall(
  admin: any,
  organizationId: string,
  callId: string,
) {
  const { data: call } = await admin.from("calls").select("*")
    .eq("id", callId).eq("organization_id", organizationId).maybeSingle();
  return call;
}

// deno-lint-ignore no-explicit-any
async function providerLegs(admin: any, call: any) {
  const { data: attempt } = await admin.from("call_attempts")
    .select("provider_call_sid, user_id, status, attempt_number")
    .eq("call_id", call.id).not("provider_call_sid", "is", null)
    .order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  if (call.direction === "incoming") {
    return {
      customerCallSid: call.call_sid || call.provider_parent_call_id,
      originalAgentCallSid: attempt?.provider_call_sid || null,
    };
  }
  return {
    customerCallSid: attempt?.provider_call_sid || null,
    originalAgentCallSid: call.call_sid || call.provider_parent_call_id,
  };
}

// deno-lint-ignore no-explicit-any
async function listTargets(
  admin: any,
  organizationId: string,
  initiatorUserId: string,
) {
  const cutoff = new Date(Date.now() - 75_000).toISOString();
  const [
    { data: memberships },
    { data: presence },
    { data: settings },
    { data: reservations },
  ] = await Promise.all([
    admin.from("user_organizations")
      .select(
        "user_id, users!inner(full_name, email), permission_profiles!inner(permissions)",
      )
      .eq("organization_id", organizationId).eq("is_active", true).neq(
        "user_id",
        initiatorUserId,
      ),
    admin.from("telephony_presence").select(
      "user_id, active_call_id, status, last_seen_at",
    )
      .eq("organization_id", organizationId).gte("last_seen_at", cutoff),
    admin.from("telephony_user_settings").select(
      "user_id, receive_calls_enabled, dnd_until",
    )
      .eq("organization_id", organizationId),
    admin.from("telephony_transfer_reservations").select("user_id")
      .eq("organization_id", organizationId),
  ]);
  return (memberships ?? []).flatMap((membership: Record<string, unknown>) => {
    const permissions = (membership.permission_profiles as {
      permissions?: Record<string, boolean>;
    } | null)?.permissions ?? {};
    const userSettings = (settings ?? []).find((row: { user_id: string }) =>
      row.user_id === membership.user_id
    );
    const sessions = (presence ?? []).filter((row: { user_id: string }) =>
      row.user_id === membership.user_id
    );
    const online = sessions.some((
      row: { status: string; active_call_id: string | null },
    ) => row.status === "available" && !row.active_call_id);
    const busy = sessions.some((row: { active_call_id: string | null }) =>
      !!row.active_call_id
    ) || (reservations ?? []).some((row: { user_id: string }) =>
      row.user_id === membership.user_id
    );
    const dnd = userSettings?.dnd_until &&
      new Date(userSettings.dnd_until).getTime() > Date.now();
    if (
      permissions.can_receive_calls !== true ||
      userSettings?.receive_calls_enabled === false || dnd || !online || busy
    ) {
      return [];
    }
    const user = membership.users as { full_name?: string; email?: string };
    return [{
      userId: membership.user_id,
      fullName: user?.full_name || user?.email || "Usuário",
      email: user?.email || null,
    }];
  });
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let queueSid: string | null = null;
  let twilio: Awaited<ReturnType<typeof twilioApiContext>> | null = null;
  let transferId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let admin: any = null;
  try {
    const context = await requireTelephonyUser(req);
    admin = context.admin;
    if (
      !await telephonyV2Enabled(context.admin, context.organizationId) ||
      !await telephonyTransferEnabled(context.admin, context.organizationId)
    ) {
      return json({ error: "telephony_transfer_disabled" }, 404);
    }
    if (context.permissions.can_transfer_calls !== true) {
      return json({ error: "cannot_transfer_calls" }, 403);
    }
    const body = await req.json() as {
      callId?: string;
      targetUserId?: string;
      action?: string;
      requestId?: string;
    };
    if (!body.callId) return json({ error: "call_id_required" }, 400);
    const call = await loadTransferableCall(
      context.admin,
      context.organizationId,
      body.callId,
    );
    if (
      !call || !["in-progress", "answered", "ringing"].includes(call.status)
    ) {
      return json({ error: "call_not_transferable" }, 409);
    }
    const currentAgent = call.current_agent_user_id ||
      call.answered_by_user_id || call.initiated_by_user_id || call.user_id;
    if (currentAgent !== context.userId) {
      return json({ error: "not_current_call_agent" }, 403);
    }
    // Independent HOLD: park the customer with hold music WITHOUT reserving a
    // colleague. The agent's leg ends naturally (customer redirected to the
    // queue); from `on_hold` they can then resume or consult a colleague.
    if (body.action === "hold") {
      const requestId = body.requestId || crypto.randomUUID();
      const { data: existingHold } = await context.admin.from("call_transfers")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("initiated_by_user_id", context.userId)
        .eq("client_request_id", requestId)
        .maybeSingle();
      if (existingHold) {
        return json({
          transferId: existingHold.id,
          state: existingHold.state,
          version: existingHold.version,
          consultationSequence: existingHold.consultation_sequence,
        });
      }
      const legs = await providerLegs(context.admin, call);
      if (!legs.customerCallSid) {
        return json({ error: "customer_provider_leg_not_found" }, 409);
      }
      twilio = await twilioApiContext(context.admin, context.organizationId);
      const queueName = `seialz_${crypto.randomUUID().replaceAll("-", "")}`;
      const queue = await createTwilioQueue(twilio, queueName);
      queueSid = queue.sid;
      const { data: held, error: holdError } = await context.admin.rpc(
        "hold_telephony_call",
        {
          _call_id: call.id,
          _initiator_user_id: context.userId,
          _queue_name: queueName,
          _customer_call_sid: legs.customerCallSid,
          _original_agent_call_sid: legs.originalAgentCallSid,
          _request_id: requestId,
        },
      );
      if (holdError || !held?.[0]) {
        await deleteTwilioQueue(twilio, queueSid).catch(() => undefined);
        queueSid = null;
        return json({
          error: (holdError?.message || "").match(/call_[a-z_]+/)?.[0] ||
            "hold_cannot_start",
        }, 409);
      }
      const heldTransferId = String(held[0].id);
      transferId = heldTransferId;
      await context.admin.from("call_transfers").update({
        provider_queue_sid: queue.sid,
        updated_at: new Date().toISOString(),
      }).eq("id", heldTransferId);
      const holdQuery = `transferId=${encodeURIComponent(heldTransferId)}&cycle=1`;
      const enqueueTwiml = `<Response><Enqueue waitUrl="${
        escapeXml(`${WEBHOOK_BASE}/transfer-wait?${holdQuery}`)
      }" waitUrlMethod="POST" action="${
        escapeXml(`${WEBHOOK_BASE}/transfer-queue-result?${holdQuery}`)
      }" method="POST">${escapeXml(queueName)}</Enqueue></Response>`;
      await updateTwilioCall(twilio, legs.customerCallSid, { twiml: enqueueTwiml });
      const { data: heldState } = await context.admin.from("call_transfers")
        .update({
          state: "on_hold",
          customer_queued_at: new Date().toISOString(),
          version: Number(held[0].version || 1) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", heldTransferId).eq("state", "parking_customer")
        .select("version, consultation_sequence").maybeSingle();
      await context.admin.from("calls").update({ transfer_status: "on_hold" })
        .eq("id", call.id);
      return json({
        transferId: heldTransferId,
        state: "on_hold",
        version: heldState?.version ?? Number(held[0].version || 1) + 1,
        consultationSequence: heldState?.consultation_sequence ?? 1,
      }, 201);
    }
    if (body.action === "targets" || !body.targetUserId) {
      return json({
        targets: await listTargets(
          context.admin,
          context.organizationId,
          context.userId,
        ),
      });
    }
    const requestId = body.requestId || crypto.randomUUID();
    const { data: existing } = await context.admin.from("call_transfers")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("initiated_by_user_id", context.userId)
      .eq("client_request_id", requestId)
      .maybeSingle();
    if (existing) {
      const adapter = new TwilioVoiceAdapter(context.admin);
      return json({
        transferId: existing.id,
        state: existing.state,
        version: existing.version,
        consultationSequence: existing.consultation_sequence,
        targetUserId: existing.target_user_id,
        connectParams: adapter.consultationParams({
          callId: existing.call_id,
          transferId: existing.id,
          targetUserId: existing.target_user_id,
          consultationSequence: existing.consultation_sequence,
        }),
      });
    }
    const legs = await providerLegs(context.admin, call);
    if (!legs.customerCallSid) {
      return json({ error: "customer_provider_leg_not_found" }, 409);
    }
    twilio = await twilioApiContext(context.admin, context.organizationId);
    const queueName = `seialz_${crypto.randomUUID().replaceAll("-", "")}`;
    const queue = await createTwilioQueue(twilio, queueName);
    queueSid = queue.sid;
    const { data: claimed, error: claimError } = await context.admin.rpc(
      "claim_telephony_transfer_target_v2",
      {
        _call_id: call.id,
        _initiator_user_id: context.userId,
        _target_user_id: body.targetUserId,
        _queue_name: queueName,
        _customer_call_sid: legs.customerCallSid,
        _original_agent_call_sid: legs.originalAgentCallSid,
        _request_id: requestId,
      },
    );
    if (claimError || !claimed?.[0]) {
      await deleteTwilioQueue(twilio, queueSid).catch(() => undefined);
      queueSid = null;
      const message = claimError?.message || "transfer_target_unavailable";
      return json({
        error: message.includes("transfer_target")
          ? message.match(/transfer_target_[a-z_]+/)?.[0] ||
            "transfer_target_unavailable"
          : "transfer_cannot_start",
      }, 409);
    }
    const claimedTransferId = String(claimed[0].id);
    transferId = claimedTransferId;
    if (claimed[0].queue_name !== queueName) {
      await deleteTwilioQueue(twilio, queueSid).catch(() => undefined);
      queueSid = null;
      const adapter = new TwilioVoiceAdapter(context.admin);
      return json({
        transferId: claimedTransferId,
        state: claimed[0].state,
        version: claimed[0].version,
        consultationSequence: claimed[0].consultation_sequence,
        targetUserId: claimed[0].target_user_id,
        connectParams: adapter.consultationParams({
          callId: call.id,
          transferId: claimedTransferId,
          targetUserId: claimed[0].target_user_id,
          consultationSequence: claimed[0].consultation_sequence,
        }),
      });
    }
    const { error: queueLinkError } = await context.admin.from("call_transfers")
      .update({
        provider_queue_sid: queue.sid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimedTransferId);
    if (queueLinkError) {
      throw new Error(`transfer_queue_link_failed:${queueLinkError.message}`);
    }
    const query = `transferId=${encodeURIComponent(claimedTransferId)}&cycle=${
      Number(claimed[0].consultation_sequence || 1)
    }`;
    const enqueueTwiml = `<Response><Enqueue waitUrl="${
      escapeXml(`${WEBHOOK_BASE}/transfer-wait?${query}`)
    }" waitUrlMethod="POST" action="${
      escapeXml(`${WEBHOOK_BASE}/transfer-queue-result?${query}`)
    }" method="POST">${escapeXml(queueName)}</Enqueue></Response>`;
    await updateTwilioCall(twilio, legs.customerCallSid, {
      twiml: enqueueTwiml,
    });
    const { data: queuedTransfer, error: queuedStateError } = await context
      .admin.from(
        "call_transfers",
      ).update({
        state: "customer_queued",
        customer_queued_at: new Date().toISOString(),
        version: Number(claimed[0].version || 1) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", claimedTransferId).eq("state", "parking_customer")
      .select("version, consultation_sequence").maybeSingle();
    if (queuedStateError) {
      throw new Error(`transfer_state_save_failed:${queuedStateError.message}`);
    }
    const { error: callStateError } = await context.admin.from("calls").update({
      transfer_status: "customer_queued",
    }).eq("id", call.id);
    if (callStateError) {
      throw new Error(
        `call_transfer_state_save_failed:${callStateError.message}`,
      );
    }
    await context.admin.from("call_transfer_events").upsert({
      organization_id: context.organizationId,
      transfer_id: claimedTransferId,
      provider_event_key: `intent:${claimedTransferId}:${requestId}`,
      event_type: "customer_park_requested",
      payload: { customerCallSid: legs.customerCallSid, queueSid: queue.sid },
    }, { onConflict: "provider,provider_event_key" });
    const adapter = new TwilioVoiceAdapter(context.admin);
    return json({
      transferId: claimedTransferId,
      state: "customer_queued",
      version: queuedTransfer?.version ?? Number(claimed[0].version || 1) + 1,
      consultationSequence: queuedTransfer?.consultation_sequence ?? 1,
      targetUserId: body.targetUserId,
      connectParams: adapter.consultationParams({
        callId: call.id,
        transferId: claimedTransferId,
        targetUserId: body.targetUserId,
        consultationSequence: queuedTransfer?.consultation_sequence ?? 1,
      }),
    }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-transfer-intent]", error);
    if (transferId && admin) {
      await admin.from("call_transfers").update({
        state: "failed",
        result: "failed",
        failure_reason: "park_failed",
        completed_at: new Date().toISOString(),
      }).eq("id", transferId);
      await admin.from("calls").update({
        transfer_status: "failed",
        active_transfer_id: null,
      }).eq("active_transfer_id", transferId);
      await admin.rpc("release_telephony_transfer_reservations", {
        _transfer_id: transferId,
      });
    }
    if (twilio && queueSid) {
      await deleteTwilioQueue(twilio, queueSid).catch(() => undefined);
    }
    const safe = safeTwilioError(error);
    return json({ error: safe.code, detail: safe.detail }, 500);
  }
});
