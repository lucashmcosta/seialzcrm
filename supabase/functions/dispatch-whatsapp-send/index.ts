import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { corsHeaders } from "../_shared/cors.ts";
import { validateCallerAuth } from "../_shared/auth.ts";
import {
  dispatchWhatsAppSend,
  type WhatsAppSendPayload,
} from "../_shared/dispatch-whatsapp-send.ts";

const payloadSchema = z.object({
  organizationId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  message: z.string().max(4096).nullish(),
  templateId: z.string().uuid().optional(),
  templateVariables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  mediaUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  mediaType: z.string().max(40).optional(),
  userId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().nullish(),
  isAgentMessage: z.boolean().optional(),
  agentId: z.string().uuid().optional(),
  senderName: z.string().max(255).nullish(),
  senderContext: z.string().max(40).optional(),
  dryRun: z.boolean().optional(),
  endpointId: z.string().uuid().optional(),
  manualReplyEndpointId: z.string().uuid().optional(),
  replyEndpointSelection: z.discriminatedUnion("source", [
    z.object({ source: z.literal("derived"), endpointId: z.string().uuid().nullish() }),
    z.object({ source: z.literal("manual"), endpointId: z.string().uuid() }),
  ]).optional(),
}).passthrough();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
  }

  const auth = await validateCallerAuth(req, parsed.data.organizationId);
  if (!auth.ok) return json(401, { error: "unauthorized", reason: auth.error });

  const authenticatedUserId = auth.kind === "user" ? auth.userId : undefined;
  const payload: WhatsAppSendPayload = {
    ...(parsed.data as WhatsAppSendPayload),
    // A identidade interna validada no servidor sempre prevalece sobre a UI.
    ...(authenticatedUserId ? { userId: authenticatedUserId } : {}),
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const result = await dispatchWhatsAppSend(payload, { supabase });
  if (result.error) {
    return json(400, {
      error: result.error.name ?? "dispatch_failed",
      message: result.error.message,
      details: result.error.details ?? null,
    });
  }
  return json(200, result.data ?? { success: true });
});