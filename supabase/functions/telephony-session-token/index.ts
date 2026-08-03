import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import { TwilioVoiceAdapter } from "../_shared/telephony/twilio.ts";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const context = await requireTelephonyUser(req);
    if (!await telephonyV2Enabled(context.admin, context.organizationId)) {
      return json({ error: "telephony_v2_disabled" }, 404);
    }
    if (
      context.permissions.can_make_calls !== true &&
      context.permissions.can_receive_calls !== true
    ) {
      return json({ error: "telephony_permission_required" }, 403);
    }
    const session = await new TwilioVoiceAdapter(context.admin).issueSession({
      organizationId: context.organizationId,
      userId: context.userId,
    });
    return json(session);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-session-token]", error);
    return json({
      error: error instanceof Error ? error.message : "internal_error",
    }, 500);
  }
});
