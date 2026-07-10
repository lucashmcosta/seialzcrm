// webchat-messages — polling por cursor. Pré-promoção lê a quarentena;
// pós-promoção lê as mensagens da thread real. Auth: session token.

import { preflight, json, serviceClient, sha256Hex } from "../_shared/webchat.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const url = new URL(req.url);
    const token = req.headers.get("x-webchat-token") || url.searchParams.get("token");
    if (!token) return json({ error: "missing_token" }, 401);
    const since = url.searchParams.get("since"); // ISO cursor (opcional)

    const sb = serviceClient();
    const tokenHash = await sha256Hex(token);
    const { data: session } = await sb.from("webchat_sessions")
      .select("id, organization_id, status, thread_id").eq("token_hash", tokenHash).maybeSingle();
    if (!session) return json({ error: "session_not_found" }, 404);

    // Pós-promoção: lê a thread real (visitante continua a conversa com o atendente)
    if (session.status === "promoted" && session.thread_id) {
      let q = sb.from("messages")
        .select("id, content, direction, created_at")
        .eq("thread_id", session.thread_id)
        .order("created_at", { ascending: true }).limit(100);
      if (since) q = q.gt("created_at", since);
      const { data } = await q;
      const messages = (data ?? []).map((m: any) => ({
        role: m.direction === "inbound" ? "visitor" : "agent",
        content: m.content, created_at: m.created_at,
      }));
      return json({ promoted: true, thread_id: session.thread_id, messages });
    }

    // Pré-promoção: lê a quarentena
    let q = sb.from("webchat_session_messages")
      .select("id, role, content, metadata, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }).limit(100);
    if (since) q = q.gt("created_at", since);
    const { data } = await q;
    return json({
      promoted: false,
      messages: (data ?? []).map((m: any) => ({
        role: m.role, content: m.content, buttons: m.metadata?.buttons ?? null,
        input: m.metadata?.input ?? null, created_at: m.created_at,
      })),
    });
  } catch (e) {
    console.error("[webchat-messages] error", (e as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
