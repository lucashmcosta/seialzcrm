import {
  classifyMetaError,
  exchangeCodeForToken,
  introspectToken,
} from "../supabase/functions/_shared/meta/connection.ts";
import { MetaGraphError } from "../supabase/functions/_shared/meta-graph.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("classifyMetaError separa auth / rate_limit / transient / permanent", () => {
  assertEquals(classifyMetaError(new MetaGraphError(400, { message: "x", code: 190 })), "auth");
  assertEquals(classifyMetaError(new MetaGraphError(400, { message: "x", code: 17 })), "rate_limit");
  assertEquals(classifyMetaError(new MetaGraphError(429, { message: "x", code: 1 })), "rate_limit");
  assertEquals(classifyMetaError(new MetaGraphError(503, { message: "x", code: 1 })), "transient");
  assertEquals(classifyMetaError(new MetaGraphError(400, { message: "x", code: 100 })), "permanent");
  assertEquals(classifyMetaError(new Error("network")), "transient");
});

Deno.test("introspectToken mapeia tipo/scopes/expiração SEM heurística", async () => {
  Deno.env.set("FACEBOOK_APP_ID", "app");
  Deno.env.set("FACEBOOK_APP_SECRET", "secret");
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/debug_token")) {
      return Promise.resolve(new Response(JSON.stringify({
        data: {
          type: "SYSTEM_USER",
          scopes: ["ads_read", "leads_retrieval"],
          expires_at: 0,               // perene -> null (mas não afirmamos system-user por isso)
          data_access_expires_at: 1893456000,
          app_id: "app",
          user_id: "123",
        },
      }), { status: 200 }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    const d = await introspectToken("tok");
    assertEquals(d.token_type, "system_user");
    assertEquals(d.expires_at, null);
    assertEquals(d.scopes.join(","), "ads_read,leads_retrieval");
    assertEquals(d.meta_user_id, "123");
    // Tipo desconhecido não vira system_user
    globalThis.fetch = ((input: Request | URL | string) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/debug_token")) {
        return Promise.resolve(new Response(JSON.stringify({ data: { type: "WHATEVER", scopes: [] } }), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;
    const d2 = await introspectToken("tok");
    assertEquals(d2.token_type, "unknown");
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("FACEBOOK_APP_ID");
    Deno.env.delete("FACEBOOK_APP_SECRET");
  }
});

Deno.test("exchangeCodeForToken lança em erro do gateway", async () => {
  Deno.env.set("FACEBOOK_APP_ID", "app");
  Deno.env.set("FACEBOOK_APP_SECRET", "secret");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ error: { message: "bad", code: 100 } }), { status: 400 }))) as typeof fetch;
  try {
    let threw = false;
    try {
      await exchangeCodeForToken("badcode");
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("FACEBOOK_APP_ID");
    Deno.env.delete("FACEBOOK_APP_SECRET");
  }
});
