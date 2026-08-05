import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import { telephonyTransferEnabled } from "../_shared/telephony/feature-flag.ts";
import { escapeXml, TwilioVoiceAdapter } from "../_shared/telephony/twilio.ts";
import {
  deleteTwilioQueue,
  safeTwilioError,
  twilioApiContext,
  updateTwilioCall,
} from "../_shared/telephony/twilio-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const WEBHOOK_BASE = `${SUPABASE_URL}/functions/v1/telephony-webhook`;

// deno-lint-ignore no-explicit-any
async function completeCommand(
  admin: any,
  commandId: string | null,
  response: Record<string, unknown>,
) {
  if (!commandId) return;
  await admin.from("call_transfer_commands").update({
    status: "completed",
    response,
    completed_at: new Date().toISOString(),
  }).eq("id", commandId);
}

// deno-lint-ignore no-explicit-any
async function failCommand(
  admin: any,
  commandId: string | null,
  errorCode: string,
) {
  if (!commandId) return;
  await admin.from("call_transfer_commands").update({
    status: "failed",
    error_code: errorCode,
    completed_at: new Date().toISOString(),
  }).eq("id", commandId);
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let commandId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let commandAdmin: any = null;
  try {
    const context = await requireTelephonyUser(req);
    commandAdmin = context.admin;
    if (context.permissions.can_transfer_calls !== true) {
      return json({ error: "cannot_transfer_calls" }, 403);
    }
    if (
      !await telephonyTransferEnabled(context.admin, context.organizationId)
    ) return json({ error: "telephony_transfer_disabled" }, 404);
    const body = await req.json() as {
      transferId?: string;
      action?:
        | "return_to_customer"
        | "consult_again"
        | "complete"
        | "cancel"
        | "end_call"
        | "resume"
        | "consult";
      expectedVersion?: number;
      requestId?: string;
      // Optional override for `consult_again`: consult a DIFFERENT colleague
      // (re-parks the customer and reserves this new target). When omitted the
      // original target is re-consulted.
      targetUserId?: string;
    };
    if (!body.transferId || !body.action) {
      return json({ error: "transfer_id_and_action_required" }, 400);
    }
    const { data: transfer } = await context.admin.from("call_transfers")
      .select("*")
      .eq("id", body.transferId).eq("organization_id", context.organizationId)
      .maybeSingle();
    if (!transfer) return json({ error: "transfer_not_found" }, 404);
    if (transfer.initiated_by_user_id !== context.userId) {
      return json({ error: "only_transfer_initiator_can_control" }, 403);
    }
    if (["completed", "canceled", "failed"].includes(transfer.state)) {
      return json({ error: "transfer_already_finished" }, 409);
    }
    const requestId = body.requestId || crypto.randomUUID();
    const { data: existingCommand } = await context.admin.from(
      "call_transfer_commands",
    ).select("status, response, error_code").eq("transfer_id", transfer.id)
      .eq("request_id", requestId).maybeSingle();
    if (existingCommand?.status === "completed" && existingCommand.response) {
      return json(existingCommand.response);
    }
    if (existingCommand?.status === "failed") {
      return json({
        error: existingCommand.error_code || "transfer_command_failed",
      }, 409);
    }
    if (existingCommand?.status === "pending") {
      return json({
        success: true,
        pending: true,
        state: transfer.state,
        version: transfer.version,
        consultationSequence: transfer.consultation_sequence,
      }, 202);
    }
    const expectedVersion = body.expectedVersion ?? transfer.version;
    if (expectedVersion !== transfer.version) {
      return json({
        error: "transfer_state_changed",
        state: transfer.state,
        version: transfer.version,
        consultationSequence: transfer.consultation_sequence,
      }, 409);
    }
    const { data: command, error: commandError } = await context.admin.from(
      "call_transfer_commands",
    ).insert({
      organization_id: context.organizationId,
      transfer_id: transfer.id,
      requested_by_user_id: context.userId,
      request_id: requestId,
      action: body.action,
      expected_version: expectedVersion,
    }).select("id").single();
    if (commandError) throw commandError;
    commandId = command.id;
    const twilio = await twilioApiContext(
      context.admin,
      context.organizationId,
    );

    if (body.action === "end_call") {
      for (
        const sid of [
          transfer.customer_call_sid,
          transfer.consult_parent_call_sid,
          transfer.consult_target_call_sid,
        ]
      ) {
        if (sid) {
          await updateTwilioCall(twilio, sid, { status: "completed" }).catch(
            () => undefined,
          );
        }
      }
      await context.admin.from("call_transfers").update({
        state: "canceled",
        result: "call_ended_by_initiator",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: transfer.version + 1,
      }).eq("id", transfer.id).eq("version", expectedVersion);
      await context.admin.from("calls").update({
        status: "completed",
        result: "answered",
        transfer_status: "canceled",
        ended_at: new Date().toISOString(),
        active_transfer_id: null,
      }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
      await context.admin.rpc("release_telephony_transfer_reservations", {
        _transfer_id: transfer.id,
      });
      await deleteTwilioQueue(twilio, transfer.provider_queue_sid).catch(() =>
        undefined
      );
      const response = {
        success: true,
        state: "canceled",
        version: transfer.version + 1,
        consultationSequence: transfer.consultation_sequence,
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }

    // Resume a customer who is on hold (no colleague involved): re-dial the
    // agent into the queue to dequeue the customer, then end the transfer mode
    // (normal call). The agent's leg ended when the customer was parked, so the
    // browser must dial back in (Mode: retrieve, FinishTransfer=1).
    if (body.action === "resume") {
      if (transfer.state !== "on_hold") {
        await failCommand(context.admin, commandId, "customer_not_on_hold");
        return json({ error: "customer_not_on_hold" }, 409);
      }
      const { data: transitioned } = await context.admin.from("call_transfers")
        .update({
          state: "returning_to_customer",
          version: transfer.version + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("version", expectedVersion)
        .eq("state", "on_hold").select("id").maybeSingle();
      if (!transitioned) {
        await failCommand(context.admin, commandId, "transfer_state_changed");
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "returning_to_customer",
      }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
      const adapter = new TwilioVoiceAdapter(context.admin);
      const response = {
        success: true,
        state: "returning_to_customer",
        version: transfer.version + 1,
        consultationSequence: transfer.consultation_sequence,
        connectParams: {
          ...adapter.consultationParams({
            callId: transfer.call_id,
            transferId: transfer.id,
            targetUserId: transfer.target_user_id ?? "",
            consultationSequence: transfer.consultation_sequence,
          }),
          Mode: "retrieve",
          FinishTransfer: "1",
        },
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }

    // Consult a colleague for a call that is already on hold: reserve the
    // colleague (customer stays parked, no re-park) and hand the browser
    // Mode: consult params to dial them.
    if (body.action === "consult") {
      if (transfer.state !== "on_hold") {
        await failCommand(context.admin, commandId, "customer_not_on_hold");
        return json({ error: "customer_not_on_hold" }, 409);
      }
      if (!body.targetUserId) {
        await failCommand(context.admin, commandId, "target_user_required");
        return json({ error: "target_user_required" }, 400);
      }
      const { data: reserved, error } = await context.admin.rpc(
        "reserve_telephony_transfer_target",
        {
          _transfer_id: transfer.id,
          _initiator_user_id: context.userId,
          _expected_version: expectedVersion,
          _target_user_id: body.targetUserId,
        },
      );
      if (error || !reserved?.[0]) {
        await failCommand(context.admin, commandId, "transfer_target_unavailable");
        return json({ error: "transfer_target_unavailable" }, 409);
      }
      const reservedTransfer = reserved[0];
      const adapter = new TwilioVoiceAdapter(context.admin);
      const response = {
        success: true,
        state: "customer_queued",
        version: reservedTransfer.version,
        consultationSequence: reservedTransfer.consultation_sequence,
        targetUserId: reservedTransfer.target_user_id,
        connectParams: adapter.consultationParams({
          callId: transfer.call_id,
          transferId: transfer.id,
          targetUserId: reservedTransfer.target_user_id,
          consultationSequence: reservedTransfer.consultation_sequence,
        }),
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }

    if (body.action === "complete") {
      if (
        transfer.state !== "consulting" || !transfer.consult_target_call_sid
      ) {
        await failCommand(context.admin, commandId, "target_not_connected");
        return json({ error: "target_not_connected" }, 409);
      }
      const { data: transitioned } = await context.admin.from("call_transfers")
        .update({
          state: "handoff_pending",
          version: transfer.version + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("state", "consulting")
        .eq("version", expectedVersion).select("id")
        .maybeSingle();
      if (!transitioned) {
        await failCommand(context.admin, commandId, "transfer_state_changed");
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "handoff_pending",
      }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
      try {
        await updateTwilioCall(twilio, transfer.consult_target_call_sid, {
          url: `${WEBHOOK_BASE}/transfer-bridge?transferId=${
            encodeURIComponent(transfer.id)
          }&actor=target&cycle=${transfer.consultation_sequence}`,
        });
      } catch (error) {
        await context.admin.from("call_transfers").update({
          state: "consulting",
          failure_reason: "handoff_redirect_failed",
          version: transfer.version + 2,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("state", "handoff_pending")
          .eq("version", transfer.version + 1);
        await context.admin.from("calls").update({
          transfer_status: "consulting",
        }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
        throw error;
      }
      const response = {
        success: true,
        state: "handoff_pending",
        version: transfer.version + 1,
        consultationSequence: transfer.consultation_sequence,
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }

    if (body.action === "return_to_customer" || body.action === "cancel") {
      if (body.action === "cancel" && transfer.state === "with_customer") {
        const { data: canceled } = await context.admin.rpc(
          "cancel_telephony_transfer_workflow",
          {
            _transfer_id: transfer.id,
            _initiator_user_id: context.userId,
            _expected_version: expectedVersion,
          },
        );
        if (!canceled?.[0]) {
          await failCommand(context.admin, commandId, "transfer_state_changed");
          return json({ error: "transfer_state_changed" }, 409);
        }
        const response = {
          success: true,
          state: "canceled",
          version: canceled[0].version,
          consultationSequence: canceled[0].consultation_sequence,
        };
        await completeCommand(context.admin, commandId, response);
        return json(response);
      }
      if (
        !["consulting", "consult_ringing", "customer_queued"].includes(
          transfer.state,
        )
      ) {
        await failCommand(
          context.admin,
          commandId,
          "customer_cannot_be_retrieved_in_current_state",
        );
        return json(
          { error: "customer_cannot_be_retrieved_in_current_state" },
          409,
        );
      }
      const finish = body.action === "cancel" ? "1" : "0";
      const { data: transitioned } = await context.admin.from("call_transfers")
        .update({
          state: "returning_to_customer",
          version: transfer.version + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("version", expectedVersion).in("state", [
          "consulting",
          "consult_ringing",
          "customer_queued",
        ]).select("id").maybeSingle();
      if (!transitioned) {
        await failCommand(context.admin, commandId, "transfer_state_changed");
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "returning_to_customer",
      }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
      if (transfer.consult_parent_call_sid) {
        try {
          await updateTwilioCall(twilio, transfer.consult_parent_call_sid, {
            url: `${WEBHOOK_BASE}/transfer-bridge?transferId=${
              encodeURIComponent(transfer.id)
            }&actor=initiator&finish=${finish}&cycle=${transfer.consultation_sequence}`,
          });
        } catch (error) {
          await context.admin.from("call_transfers").update({
            state: transfer.state,
            failure_reason: "return_redirect_failed",
            version: transfer.version + 2,
            updated_at: new Date().toISOString(),
          }).eq("id", transfer.id).eq("state", "returning_to_customer")
            .eq("version", transfer.version + 1);
          await context.admin.from("calls").update({
            transfer_status: transfer.state,
          }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
          throw error;
        }
        const response = {
          success: true,
          state: "returning_to_customer",
          version: transfer.version + 1,
          consultationSequence: transfer.consultation_sequence,
        };
        await completeCommand(context.admin, commandId, response);
        return json(response);
      }
      const adapter = new TwilioVoiceAdapter(context.admin);
      const response = {
        success: true,
        state: "returning_to_customer",
        version: transfer.version + 1,
        consultationSequence: transfer.consultation_sequence,
        connectParams: {
          ...adapter.consultationParams({
            callId: transfer.call_id,
            transferId: transfer.id,
            targetUserId: transfer.target_user_id,
            consultationSequence: transfer.consultation_sequence,
          }),
          Mode: "retrieve",
          FinishTransfer: finish,
        },
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }

    if (body.action === "consult_again") {
      if (transfer.state !== "with_customer") {
        await failCommand(
          context.admin,
          commandId,
          "customer_not_with_initiator",
        );
        return json({ error: "customer_not_with_initiator" }, 409);
      }
      const { data: reclaimed, error } = await context.admin.rpc(
        "reclaim_telephony_transfer_target_v3",
        {
          _transfer_id: transfer.id,
          _initiator_user_id: context.userId,
          _expected_version: expectedVersion,
          _target_user_id: body.targetUserId ?? null,
        },
      );
      if (error || !reclaimed?.[0]) {
        await failCommand(
          context.admin,
          commandId,
          "transfer_target_unavailable",
        );
        return json({ error: "transfer_target_unavailable" }, 409);
      }
      const reclaimedTransfer = reclaimed[0];
      const cycle = Number(reclaimedTransfer.consultation_sequence);
      const enqueueTwiml = `<Response><Enqueue waitUrl="${
        escapeXml(
          `${WEBHOOK_BASE}/transfer-wait?transferId=${
            encodeURIComponent(transfer.id)
          }&cycle=${cycle}`,
        )
      }" waitUrlMethod="POST" action="${
        escapeXml(
          `${WEBHOOK_BASE}/transfer-queue-result?transferId=${
            encodeURIComponent(transfer.id)
          }&cycle=${cycle}`,
        )
      }" method="POST">${escapeXml(transfer.queue_name)}</Enqueue></Response>`;
      try {
        await updateTwilioCall(twilio, transfer.customer_call_sid, {
          twiml: enqueueTwiml,
        });
      } catch (error) {
        await context.admin.from("call_transfers").update({
          state: "with_customer",
          failure_reason: "repark_failed",
          version: Number(reclaimedTransfer.version) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("version", reclaimedTransfer.version);
        await context.admin.from("calls").update({
          transfer_status: "with_customer",
        }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
        await context.admin.rpc("release_telephony_transfer_reservations", {
          _transfer_id: transfer.id,
        });
        throw error;
      }
      const { data: queuedTransfer } = await context.admin.from(
        "call_transfers",
      ).update({
        state: "customer_queued",
        customer_queued_at: new Date().toISOString(),
        version: Number(reclaimedTransfer.version) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", transfer.id).eq("version", reclaimedTransfer.version)
        .select("version, consultation_sequence").maybeSingle();
      if (!queuedTransfer) {
        await failCommand(context.admin, commandId, "transfer_state_changed");
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "customer_queued",
      }).eq("id", transfer.call_id).eq("active_transfer_id", transfer.id);
      const adapter = new TwilioVoiceAdapter(context.admin);
      const response = {
        success: true,
        state: "customer_queued",
        version: queuedTransfer.version,
        consultationSequence: queuedTransfer.consultation_sequence,
        // Reflect the RECLAIMED target (may be a different colleague than the
        // original) so the client dials the right person and updates its label.
        targetUserId: reclaimedTransfer.target_user_id,
        connectParams: adapter.consultationParams({
          callId: transfer.call_id,
          transferId: transfer.id,
          targetUserId: reclaimedTransfer.target_user_id,
          consultationSequence: cycle,
        }),
      };
      await completeCommand(context.admin, commandId, response);
      return json(response);
    }
    await failCommand(context.admin, commandId, "invalid_action");
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-transfer-control]", error);
    const safe = safeTwilioError(error);
    await failCommand(commandAdmin, commandId, safe.code).catch(() =>
      undefined
    );
    return json({ error: safe.code, detail: safe.detail }, 500);
  }
});
