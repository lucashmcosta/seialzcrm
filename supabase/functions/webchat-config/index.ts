// webchat-config — devolve APENAS o subconjunto visual + roteiro do widget.
// Nunca retorna target/assignment/verification/allowed_domains (config sensível).
// Auth: widget key pública (x-webchat-key). Origin da landing validada como
// anti-abuso soft (o parent_origin é reportado pelo loader).

import { preflight, json, serviceClient, resolveWidget, checkAllowedOrigin, edgeAuthMode } from "../_shared/webchat.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const url = new URL(req.url);
    const widgetKey = req.headers.get("x-webchat-key") || url.searchParams.get("key");
    const parentOrigin = req.headers.get("x-webchat-origin") || url.searchParams.get("origin");

    const sb = serviceClient();
    const widget = await resolveWidget(sb, widgetKey);
    if (!widget) return json({ error: "widget_not_found" }, 404);

    const mode = edgeAuthMode();
    if (!checkAllowedOrigin(parentOrigin, widget.inbound_settings)) {
      console.warn("[webchat-config][AUTH-OBSERVE] origin not allowed", JSON.stringify({
        widget: widgetKey, parent_origin: parentOrigin, org: widget.organization_id,
      }));
      if (mode === "enforce") return json({ error: "origin_not_allowed" }, 403);
    }

    const s = widget.inbound_settings || {};
    const steps = Array.isArray(s?.flow?.steps) ? s.flow.steps : [];
    // Só o que o visitante precisa ver — nada de save_as/target/etc. desnecessário.
    const publicSteps = steps.map((st: any) => ({
      id: st.id, bot: st.bot, buttons: st.buttons, input: st.input,
    }));

    return json({
      widget_key: widgetKey,
      brand: s.brand ?? { display_name: widget.display_name },
      theme: s.theme ?? {},
      business_hours: s.business_hours ?? null,
      offline_note: s.offline_note ?? null,
      whatsapp_fallback: s.whatsapp_bridge?.enabled ? (s.whatsapp_bridge?.wa_link ?? null) : null,
      flow: { steps: publicSteps },
    });
  } catch (e) {
    console.error("[webchat-config] error", (e as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
