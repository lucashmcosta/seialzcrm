// webchat-message — cria sessão na 1ª mensagem e avança o roteiro nas demais.
// Grava tudo na quarentena (webchat_session_messages). Ao completar o fluxo
// com nome + telefone válidos, marca a sessão 'qualified' e chama
// promote_session_to_contact() (que cria contact/opportunity/thread e dispara
// CAPI/outbox/round-robin por trigger).
//
// Sem token  => action de início: resolve widget, cria sessão, retorna 1ª fala.
// Com token  => avança: valida o step, salva resposta, retorna próxima fala.
// Idempotente por step_id (retry do cliente re-renderiza o step atual).

import {
  preflight, json, serviceClient, resolveWidget, checkAllowedOrigin,
  edgeAuthMode, sha256Hex, newSessionToken, logInbound,
} from "../_shared/webchat.ts";
import { startFlow, advanceFlow, initialState, type Flow, type FlowState } from "../_shared/webchat-flow.ts";

async function recordBot(sb: any, session: any, turns: { step_id: string; text: string; buttons?: string[]; input?: string }[]) {
  if (!turns.length) return;
  await sb.from("webchat_session_messages").insert(
    turns.map((t) => ({
      organization_id: session.organization_id,
      session_id: session.id,
      role: "bot",
      content: t.text,
      metadata: { step_id: t.step_id, buttons: t.buttons ?? null, input: t.input ?? null },
    })),
  );
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const sb = serviceClient();
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("x-webchat-token") || body.session_token || null;
    const mode = edgeAuthMode();

    // ============ INÍCIO DE SESSÃO ============
    if (!token) {
      const widgetKey = req.headers.get("x-webchat-key") || body.widget_key;
      const widget = await resolveWidget(sb, widgetKey);
      if (!widget) return json({ error: "widget_not_found" }, 404);

      const parentOrigin = body.parent_origin || req.headers.get("x-webchat-origin");
      if (!checkAllowedOrigin(parentOrigin, widget.inbound_settings)) {
        console.warn("[webchat-message][AUTH-OBSERVE] origin not allowed", JSON.stringify({ widget: widgetKey, parent_origin: parentOrigin }));
        if (mode === "enforce") return json({ error: "origin_not_allowed" }, 403);
      }

      const flow: Flow = widget.inbound_settings?.flow ?? { steps: [] };
      const first = startFlow(flow);

      const sessionToken = newSessionToken();
      const tokenHash = await sha256Hex(sessionToken);
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

      const { data: session, error: insErr } = await sb.from("webchat_sessions").insert({
        organization_id: widget.organization_id,
        endpoint_id: widget.id,
        token_hash: tokenHash,
        status: "active",
        flow_state: first.state,
        landing_url: body.landing_url ?? null,
        referrer: body.referrer ?? null,
        utm: body.utm ?? {},
        fbclid: body.fbclid ?? null,
        fbc: body.fbc ?? null,
        fbp: body.fbp ?? null,
        ip,
        user_agent: req.headers.get("user-agent") ?? null,
      }).select("*").single();
      if (insErr || !session) {
        console.error("[webchat-message] session insert failed", insErr?.message);
        return json({ error: "session_create_failed" }, 500);
      }

      await recordBot(sb, session, first.bot);
      await logInbound(sb, {
        organization_id: widget.organization_id, source_event: "session_start",
        external_id: session.id, idempotency_key: `webchat:${session.id}:start`,
        raw_payload: { landing_url: body.landing_url, utm: body.utm },
      });

      return json({ session_token: sessionToken, session_id: session.id, bot: first.bot, done: false });
    }

    // ============ AVANÇO DE FLUXO ============
    const tokenHash = await sha256Hex(token);
    const { data: session } = await sb.from("webchat_sessions")
      .select("*").eq("token_hash", tokenHash).maybeSingle();
    if (!session) return json({ error: "session_not_found" }, 404);
    if (session.status === "promoted") return json({ bot: [], done: true, promoted: true });
    if (session.status === "blocked" || session.status === "expired") return json({ error: "session_closed" }, 410);

    const { data: widget } = await sb.from("communication_endpoints")
      .select("inbound_settings, display_name").eq("id", session.endpoint_id).maybeSingle();
    const flow: Flow = (widget?.inbound_settings?.flow) ?? { steps: [] };
    const state: FlowState = session.flow_state ?? initialState();

    const stepId: string | undefined = body.step_id;
    const value: string = (body.value ?? "").toString();
    const clientMsgId: string = (body.client_message_id ?? crypto.randomUUID()).toString();

    // Idempotência: se o cliente respondeu um step que já não é o atual (retry),
    // re-renderiza o step corrente sem avançar/duplicar.
    const currentStep = flow.steps[state.step_index];
    if (stepId && currentStep && stepId !== currentStep.id) {
      return json({ bot: [{ step_id: currentStep.id, text: currentStep.bot, buttons: currentStep.buttons, input: currentStep.input }], done: false, idempotent: true });
    }

    // Registra a fala do visitante na quarentena
    await sb.from("webchat_session_messages").insert({
      organization_id: session.organization_id,
      session_id: session.id,
      role: "visitor",
      content: value,
      metadata: { step_id: currentStep?.id ?? null, client_message_id: clientMsgId },
    });
    await logInbound(sb, {
      organization_id: session.organization_id, source_event: "visitor_message",
      external_id: session.id, idempotency_key: `webchat:${session.id}:${clientMsgId}`,
      raw_payload: { step_id: currentStep?.id, value },
    });

    const result = advanceFlow(flow, state, value);

    // Persiste estado + nome/telefone coletados
    const collected = result.state.collected;
    const patch: Record<string, unknown> = { flow_state: result.state, last_seen_at: new Date().toISOString() };
    if (collected.name) patch.visitor_name = collected.name;
    if (collected.phone) patch.visitor_phone = collected.phone;
    await sb.from("webchat_sessions").update(patch).eq("id", session.id);

    await recordBot(sb, session, result.bot);

    // Fluxo terminou e está qualificado => promove
    let promoted = false;
    if (!result.needsInput && result.qualified) {
      await sb.from("webchat_sessions").update({ status: "qualified" }).eq("id", session.id);
      const { error: promoteErr } = await sb.rpc("promote_session_to_contact", { p_session_id: session.id });
      if (promoteErr) {
        console.error("[webchat-message] promote failed", promoteErr.message);
      } else {
        promoted = true;
      }
    }

    return json({ bot: result.bot, done: !result.needsInput, promoted, error: result.error ?? null });
  } catch (e) {
    console.error("[webchat-message] error", (e as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
