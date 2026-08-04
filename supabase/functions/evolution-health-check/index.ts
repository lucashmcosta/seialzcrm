// evolution-health-check — refresh periódico do estado real das instâncias.
//
// Motivo (auditoria 04/08/2026): o estado em `evolution_instances` só era
// escrito por webhook (`CONNECTION_UPDATE`) ou por ação manual na UI. Quando
// uma sessão Baileys morre silenciosamente, nenhum webhook chega — o banco
// fica com o último rótulo conhecido e `last_state_checked_at` congelado.
//
// Esta função pergunta ao servidor Evolution o estado atual de cada instância
// registrada e persiste o resultado normalizado, mesmo sem tráfego.
//
// Auth: header `x-worker-token` deve bater com INTEGRATION_WORKER_TOKEN.
// Efeitos: UPDATE em evolution_instances (state + checked_at) e heartbeat em
// outbox_system_heartbeats (component = 'evolution-health-check').

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { readEvolutionEnv } from "../_shared/evolution/client.ts";
import { makeEvolutionProvider } from "../_shared/evolution/provider.ts";
import { normalizeEvolutionState } from "../_shared/evolution/state.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_TOKEN = Deno.env.get("INTEGRATION_WORKER_TOKEN") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-worker-token") ?? "";
  if (!WORKER_TOKEN || token !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "misconfigured" }, 500);
  }

  const requestId = newRequestId();
  const env = readEvolutionEnv();
  if ("code" in env) {
    logEvolution("warn", "evolution-health-check", "missing_env", { requestId, code: env.code });
    return json({ error: env.code, message: env.message }, env.status);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: instances, error } = await supabase
    .from("evolution_instances")
    .select("id, instance_name, organization_id, last_known_state");

  if (error) {
    logEvolution("error", "evolution-health-check", "select_failed", { requestId, error: error.message });
    return json({ error: "select_failed", message: error.message }, 500);
  }

  const provider = makeEvolutionProvider(env, requestId);
  const now = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  let checked = 0;
  let changed = 0;
  let failures = 0;

  for (const inst of instances ?? []) {
    const name = String((inst as any).instance_name ?? "");
    if (!name) continue;
    checked++;

    const res = await provider.connectionState(name);
    if (typeof res !== "string") {
      failures++;
      results.push({ instance: name, ok: false, code: res.code });
      logEvolution("warn", "evolution-health-check", "state_probe_failed", {
        requestId,
        instance: name,
        code: res.code,
        status: res.status,
      });
      continue;
    }

    const state = normalizeEvolutionState(res) ?? "unknown";
    const previous = String((inst as any).last_known_state ?? "");
    const stateChanged = previous !== state;

    const { error: upErr } = await supabase
      .from("evolution_instances")
      .update({ last_known_state: state, last_state_checked_at: now, updated_at: now })
      .eq("id", (inst as any).id);

    if (upErr) {
      failures++;
      results.push({ instance: name, ok: false, state, code: "update_failed" });
      logEvolution("error", "evolution-health-check", "update_failed", {
        requestId,
        instance: name,
        error: upErr.message,
      });
      continue;
    }

    if (stateChanged) {
      changed++;
      logEvolution("info", "evolution-health-check", "state_changed", {
        requestId,
        instance: name,
        from: previous || null,
        to: state,
      });
    }
    results.push({ instance: name, ok: true, state, previous: previous || null, changed: stateChanged });
  }

  // Heartbeat: prova de vida do checker, independente de haver instâncias.
  await supabase.from("outbox_system_heartbeats").upsert(
    {
      component: "evolution-health-check",
      last_run_at: now,
      last_detail: { checked, changed, failures, requestId },
    },
    { onConflict: "component" },
  );

  return json({ ok: true, requestId, checked, changed, failures, instances: results });
});
