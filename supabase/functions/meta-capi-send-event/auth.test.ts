import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeSendEvent } from "./auth.ts";
import { fakeAdmin, ORG, OTHER, req } from "../_shared/auth/fake-admin.testutil.ts";

Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

const decide = async (token: string | undefined, body: Record<string, unknown>, admin = fakeAdmin()) => {
  const d = await authorizeSendEvent(req(token), admin, body);
  return d.ok ? `ok:${d.caller.kind}` : `${d.status}:${d.error}`;
};

// --- Produção: triggers (token interno) e retry-cron/backfill (service key) ---
Deno.test("trigger fn_capi_dispatch_event (token interno) → ok sem consultar membership", async () => {
  const admin = fakeAdmin();
  assertEquals(await decide("internal-token", { organization_id: OTHER, event_name: "Lead" }, admin), "ok:internal");
  assertEquals(admin.calls, []); // nenhuma leitura extra no caminho quente
});

Deno.test("retry-cron (service key + capi_event_log_id) → ok sem consultar nada", async () => {
  const admin = fakeAdmin();
  assertEquals(await decide("service-key", { capi_event_log_id: "log-other" }, admin), "ok:service");
  assertEquals(admin.calls, []);
});

// --- Usuário: botão "testar" (organization_id) ---
Deno.test("membro ativo testando a própria org → ok", async () => {
  assertEquals(await decide("jwt:auth-member", { organization_id: ORG, event_name: "Lead", test: true }), "ok:user");
});

Deno.test("membro de outra org → 403", async () => {
  assertEquals(await decide("jwt:auth-outsider", { organization_id: ORG, event_name: "Lead" }), "403:forbidden_org");
});

Deno.test("membro inativo → 403", async () => {
  assertEquals(await decide("jwt:auth-inactive", { organization_id: ORG, event_name: "Lead" }), "403:forbidden_org");
});

// --- Usuário: "reprocessar" (capi_event_log_id → org vem do log) ---
Deno.test("reprocessar log da própria org → ok", async () => {
  assertEquals(await decide("jwt:auth-member", { capi_event_log_id: "log-org" }), "ok:user");
});

Deno.test("reprocessar log de outra org → 403 mesmo mandando organization_id própria", async () => {
  assertEquals(
    await decide("jwt:auth-member", { capi_event_log_id: "log-other", organization_id: ORG }),
    "403:forbidden_org",
  );
});

Deno.test("reprocessar log inexistente → 404 (mesmo contrato do handler)", async () => {
  assertEquals(await decide("jwt:auth-member", { capi_event_log_id: "nope" }), "404:Log não encontrado");
});

Deno.test("erro ao ler o log → 403 (fail-closed)", async () => {
  assertEquals(
    await decide("jwt:auth-member", { capi_event_log_id: "log-org" }, fakeAdmin({ failQueries: true })),
    "403:forbidden_org",
  );
});

// --- Credenciais rejeitadas ---
Deno.test("bearer inválido → 401", async () => {
  assertEquals((await decide("garbage", { organization_id: ORG, event_name: "Lead" })).startsWith("401:"), true);
});

Deno.test("sem Authorization → 401", async () => {
  assertEquals((await decide(undefined, { organization_id: ORG, event_name: "Lead" })).startsWith("401:"), true);
});

Deno.test("anon key → 401", async () => {
  assertEquals((await decide("anon-key", { organization_id: ORG, event_name: "Lead" })).startsWith("401:"), true);
});
