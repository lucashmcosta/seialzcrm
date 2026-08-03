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

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const context = await requireTelephonyUser(req);
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
        | "end_call";
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
      }).eq("id", transfer.id);
      await context.admin.from("calls").update({
        status: "completed",
        result: "answered",
        transfer_status: "canceled",
        ended_at: new Date().toISOString(),
      }).eq("id", transfer.call_id);
      await context.admin.rpc("release_telephony_transfer_reservations", {
        _transfer_id: transfer.id,
      });
      await deleteTwilioQueue(twilio, transfer.provider_queue_sid).catch(() =>
        undefined
      );
      return json({ success: true, state: "canceled" });
    }

    if (body.action === "complete") {
      if (
        transfer.state !== "consulting" || !transfer.consult_target_call_sid
      ) return json({ error: "target_not_connected" }, 409);
      const { data: transitioned } = await context.admin.from("call_transfers")
        .update({
          state: "handoff_pending",
          version: transfer.version + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("state", "consulting").select("id")
        .maybeSingle();
      if (!transitioned) {
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "handoff_pending",
      }).eq("id", transfer.call_id);
      try {
        await updateTwilioCall(twilio, transfer.consult_target_call_sid, {
          url: `${WEBHOOK_BASE}/transfer-bridge?transferId=${
            encodeURIComponent(transfer.id)
          }&actor=target`,
        });
      } catch (error) {
        await context.admin.from("call_transfers").update({
          state: "consulting",
          failure_reason: "handoff_redirect_failed",
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id);
        await context.admin.from("calls").update({
          transfer_status: "consulting",
        }).eq("id", transfer.call_id);
        throw error;
      }
      return json({ success: true, state: "handoff_pending" });
    }

    if (body.action === "return_to_customer" || body.action === "cancel") {
      if (body.action === "cancel" && transfer.state === "with_customer") {
        await context.admin.from("call_transfers").update({
          state: "canceled",
          result: "canceled_by_initiator",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id);
        await context.admin.from("calls").update({
          transfer_status: "canceled",
        }).eq("id", transfer.call_id);
        await context.admin.from("telephony_presence").update({
          active_call_id: null,
        })
          .eq("organization_id", transfer.organization_id).eq(
            "user_id",
            transfer.target_user_id,
          )
          .eq("active_call_id", transfer.call_id);
        return json({ success: true, state: "canceled" });
      }
      if (
        !["consulting", "consult_ringing", "customer_queued"].includes(
          transfer.state,
        )
      ) {
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
        }).eq("id", transfer.id).in("state", [
          "consulting",
          "consult_ringing",
          "customer_queued",
        ]).select("id").maybeSingle();
      if (!transitioned) {
        return json({ error: "transfer_state_changed" }, 409);
      }
      await context.admin.from("calls").update({
        transfer_status: "returning_to_customer",
      }).eq("id", transfer.call_id);
      if (transfer.consult_parent_call_sid) {
        try {
          await updateTwilioCall(twilio, transfer.consult_parent_call_sid, {
            url: `${WEBHOOK_BASE}/transfer-bridge?transferId=${
              encodeURIComponent(transfer.id)
            }&actor=initiator&finish=${finish}`,
          });
        } catch (error) {
          await context.admin.from("call_transfers").update({
            state: transfer.state,
            failure_reason: "return_redirect_failed",
            updated_at: new Date().toISOString(),
          }).eq("id", transfer.id).eq("state", "returning_to_customer");
          await context.admin.from("calls").update({
            transfer_status: transfer.state,
          }).eq("id", transfer.call_id);
          throw error;
        }
        return json({ success: true, state: "returning_to_customer" });
      }
      const adapter = new TwilioVoiceAdapter(context.admin);
      return json({
        success: true,
        state: "returning_to_customer",
        connectParams: {
          ...adapter.consultationParams({
            callId: transfer.call_id,
            transferId: transfer.id,
            targetUserId: transfer.target_user_id,
          }),
          Mode: "retrieve",
          FinishTransfer: finish,
        },
      });
    }

    if (body.action === "consult_again") {
      if (transfer.state !== "with_customer") {
        return json({ error: "customer_not_with_initiator" }, 409);
      }
      const { data: reclaimed, error } = await context.admin.rpc(
        "reclaim_telephony_transfer_target",
        {
          _transfer_id: transfer.id,
          _initiator_user_id: context.userId,
        },
      );
      if (error || reclaimed !== true) {
        return json({ error: "transfer_target_unavailable" }, 409);
      }
      const enqueueTwiml = `<Response><Enqueue waitUrl="${
        escapeXml(
          `${WEBHOOK_BASE}/transfer-wait?transferId=${
            encodeURIComponent(transfer.id)
          }`,
        )
      }" waitUrlMethod="POST" action="${
        escapeXml(
          `${WEBHOOK_BASE}/transfer-queue-result?transferId=${
            encodeURIComponent(transfer.id)
          }`,
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
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id);
        await context.admin.from("calls").update({
          transfer_status: "with_customer",
        }).eq("id", transfer.call_id);
        await context.admin.from("telephony_presence").update({
          active_call_id: null,
        })
          .eq("organization_id", transfer.organization_id).eq(
            "user_id",
            transfer.target_user_id,
          ).eq("active_call_id", transfer.call_id);
        throw error;
      }
      await context.admin.from("call_transfers").update({
        state: "customer_queued",
        customer_queued_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", transfer.id);
      await context.admin.from("calls").update({
        transfer_status: "customer_queued",
      }).eq("id", transfer.call_id);
      const adapter = new TwilioVoiceAdapter(context.admin);
      return json({
        success: true,
        state: "customer_queued",
        connectParams: adapter.consultationParams({
          callId: transfer.call_id,
          transferId: transfer.id,
          targetUserId: transfer.target_user_id,
        }),
      });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-transfer-control]", error);
    const safe = safeTwilioError(error);
    return json({ error: safe.code, detail: safe.detail }, 500);
  }
});
