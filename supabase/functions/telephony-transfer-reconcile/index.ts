import { createClient } from "npm:@supabase/supabase-js@2";
import { validateServiceRoleAuth } from "../_shared/auth.ts";
import { escapeXml } from "../_shared/telephony/twilio.ts";
import {
  deleteTwilioQueue,
  twilioAccountUrl,
  twilioApiContext,
  twilioRequest,
  updateTwilioCall,
} from "../_shared/telephony/twilio-api.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (!validateServiceRoleAuth(req).ok) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: stale, error } = await admin.from("call_transfers").select("*")
    .in("state", [
      "parking_customer",
      "customer_queued",
      "consult_ringing",
      "returning_to_customer",
      "handoff_pending",
      "with_customer",
    ]).lt("updated_at", cutoff)
    .limit(100);
  if (error) return json({ error: error.message }, 500);
  let reconciled = 0;
  const failures: Array<{ transferId: string; error: string }> = [];
  for (const transfer of stale ?? []) {
    try {
      const { data: call } = await admin.from("calls").select(
        "*, organization_phone_numbers(id, phone_number, friendly_name, fallback_message, missed_call_owner_user_id)",
      )
        .eq("id", transfer.call_id).maybeSingle();
      const number = call?.organization_phone_numbers as {
        id: string;
        phone_number: string;
        friendly_name?: string;
        fallback_message?: string;
        missed_call_owner_user_id?: string | null;
      } | null;
      const fallbackMessage = number?.fallback_message ||
        "Não foi possível concluir a transferência. Retornaremos em breve.";
      const twilio = await twilioApiContext(admin, transfer.organization_id);
      if (transfer.state === "with_customer") {
        const providerCall = await twilioRequest<{ status?: string }>(
          twilio,
          twilioAccountUrl(
            twilio,
            `Calls/${transfer.customer_call_sid}.json`,
          ),
        );
        if (
          ["queued", "ringing", "in-progress"].includes(
            providerCall.status || "",
          )
        ) continue;
        await admin.from("call_transfers").update({
          state: "canceled",
          result: "customer_call_ended",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", transfer.id).eq("state", "with_customer");
        await admin.from("calls").update({
          status: "completed",
          result: "answered",
          transfer_status: "canceled",
          ended_at: new Date().toISOString(),
        }).eq("id", transfer.call_id);
        await admin.rpc("release_telephony_transfer_reservations", {
          _transfer_id: transfer.id,
        });
        await deleteTwilioQueue(twilio, transfer.provider_queue_sid).catch(
          () => undefined,
        );
        reconciled += 1;
        continue;
      }
      await updateTwilioCall(twilio, transfer.customer_call_sid, {
        twiml: `<Response><Say language="pt-BR">${
          escapeXml(fallbackMessage)
        }</Say><Hangup/></Response>`,
      }).catch(() => undefined);
      for (
        const sid of [
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
      await admin.from("call_transfers").update({
        state: "failed",
        result: "reconciled_timeout",
        failure_reason: "transfer_stale_over_5_minutes",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", transfer.id).not(
        "state",
        "in",
        "(completed,canceled,failed)",
      );
      let missedTaskId = call?.missed_task_id ?? null;
      if (!missedTaskId && call && number) {
        let owner = number.missed_call_owner_user_id ?? null;
        if (owner) {
          const { data: activeOwner } = await admin.from("user_organizations")
            .select("user_id").eq("organization_id", transfer.organization_id)
            .eq("user_id", owner).eq("is_active", true).maybeSingle();
          if (!activeOwner) owner = null;
        }
        if (!owner) {
          const { data: memberships } = await admin.from("user_organizations")
            .select("user_id, permission_profiles!inner(permissions)")
            .eq("organization_id", transfer.organization_id)
            .eq("is_active", true).order("created_at");
          owner = (memberships ?? []).find((membership) => {
            const profile = membership.permission_profiles as unknown as {
              permissions?: Record<string, boolean>;
            };
            return profile.permissions?.can_manage_telephony === true;
          })?.user_id ?? null;
        }
        if (owner) {
          const { data: task, error: taskError } = await admin.from("tasks")
            .insert({
              organization_id: transfer.organization_id,
              assigned_user_id: owner,
              contact_id: call.contact_id,
              opportunity_id: call.opportunity_id,
              title: `Retornar ligação após falha de transferência de ${
                call.from_number || call.to_number || "número desconhecido"
              }`,
              description: `A transferência da chamada no número ${
                number.friendly_name || number.phone_number
              } não pôde ser concluída.`,
              task_type: "missed_call",
              status: "open",
              priority: "high",
              due_at: new Date(Date.now() + 15 * 60_000).toISOString(),
              source_external_id: call.id,
            }).select("id").maybeSingle();
          if (taskError?.code === "23505") {
            const { data: existing } = await admin.from("tasks").select("id")
              .eq("organization_id", transfer.organization_id)
              .eq("source_external_id", call.id).eq("task_type", "missed_call")
              .maybeSingle();
            missedTaskId = existing?.id ?? null;
          } else if (taskError) {
            console.error(
              "[telephony-transfer-reconcile] fallback task failed",
              {
                transferId: transfer.id,
                error: taskError.message,
              },
            );
          } else {
            missedTaskId = task?.id ?? null;
          }
        } else {
          console.error("[telephony-transfer-reconcile] no fallback owner", {
            transferId: transfer.id,
            organizationId: transfer.organization_id,
          });
        }
      }
      await admin.from("calls").update({
        status: "failed",
        result: "transfer_failed",
        transfer_status: "failed",
        missed_task_id: missedTaskId,
        ended_at: new Date().toISOString(),
      }).eq("id", transfer.call_id);
      await admin.rpc("release_telephony_transfer_reservations", {
        _transfer_id: transfer.id,
      });
      await deleteTwilioQueue(twilio, transfer.provider_queue_sid).catch(() =>
        undefined
      );
      reconciled += 1;
    } catch (cause) {
      failures.push({
        transferId: transfer.id,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return json({
    ok: failures.length === 0,
    scanned: stale?.length ?? 0,
    reconciled,
    failures,
  });
});
