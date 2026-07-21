// Wrapper client-side para o Edge Function `thread-migrate-endpoint-send`.
//
// Único ponto autorizado a migrar uma thread WhatsApp para outro endpoint
// (hoje: Evolution API) junto com o primeiro envio livre. Todo o resto do
// app continua usando `dispatchWhatsAppSend` normal, que mantém a regra dura
// anti cross-number send.

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_FUNCTIONS_URL = "https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE";

export interface MigrateThreadAndSendPayload {
  organizationId: string;
  threadId: string;
  targetEndpointId: string;
  message: string;
  userId?: string;
  replyToMessageId?: string | null;
}

export interface MigrateThreadAndSendResult {
  data: {
    migrated?: boolean;
    messageId?: string;
    newPrimaryEndpointId?: string;
    noteInserted?: boolean;
  } | null;
  error: { message: string; name?: string; status?: number } | null;
}

export async function migrateThreadAndSend(
  payload: MigrateThreadAndSendPayload,
): Promise<MigrateThreadAndSendResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { data: null, error: { message: "not_authenticated", name: "missing_session" } };
  }

  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/thread-migrate-endpoint-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        organizationId: payload.organizationId,
        threadId: payload.threadId,
        targetEndpointId: payload.targetEndpointId,
        message: payload.message,
        userId: payload.userId,
        replyToMessageId: payload.replyToMessageId ?? undefined,
      }),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    if (!res.ok) {
      const errMsg = json?.message || json?.details || json?.error || `HTTP ${res.status}`;
      console.error("[migrateThreadAndSend] non-2xx", {
        status: res.status,
        body: json,
        threadId: payload.threadId,
        targetEndpointId: payload.targetEndpointId,
      });
      return {
        data: null,
        error: { message: errMsg, name: json?.error || "http_error", status: res.status },
      };
    }
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message, name: "fetch_failed" } };
  }
}
