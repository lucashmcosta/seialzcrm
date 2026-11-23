import { assertEquals } from "jsr:@std/assert@1";
import { decideServiceAuth, isKnownInternalKey, sameSecret, serviceAuthMode, validateServiceRoleAuth } from "./auth.ts";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const forjado = (ref: string) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role", iss: "supabase", ref })}.assinatura-inventada`;

Deno.test("o problema: a conferência antiga aceita token que ninguém assinou", () => {
  Deno.env.set("SUPABASE_URL", "https://projeto-de-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-interna-ficticia-so-para-teste");
  const req = new Request("https://x.invalid/fn", { headers: { authorization: `Bearer ${forjado("projeto-de-teste")}` } });
  // É este comportamento que verifyServiceRoleAuth corrige quando SERVICE_AUTH_STRICT=enforce.
  assertEquals(validateServiceRoleAuth(req).ok, true);
});

Deno.test("chave interna é só a igual, caractere por caractere", () => {
  const env = "chave-interna-ficticia-so-para-teste";
  const cofre = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura-verdadeira";
  assertEquals(isKnownInternalKey(env, [env, cofre]), true);
  assertEquals(isKnownInternalKey(cofre, [env, cofre]), true);
  assertEquals(isKnownInternalKey(forjado("projeto-de-teste"), [env, cofre]), false);
  // mesmas claims da chave do cofre, assinatura trocada
  assertEquals(isKnownInternalKey(cofre.replace("assinatura-verdadeira", "assinatura-trocada--"), [env, cofre]), false);
  // sem chave conhecida ninguém passa, nem vazio contra vazio
  assertEquals(isKnownInternalKey(env, []), false);
  assertEquals(isKnownInternalKey("", ["", null, undefined]), false);
  assertEquals(isKnownInternalKey("x", ["", null, undefined]), false);
  assertEquals(sameSecret("abc", "abc"), true);
  assertEquals(sameSecret("abc", "abd"), false);
  assertEquals(sameSecret("abc", "abcd"), false);
});

Deno.test("decisão: chave conhecida sempre passa; claims inválidas nunca", () => {
  for (const mode of ["log", "enforce"] as const) {
    assertEquals(decideServiceAuth({ ok: false, error: "Invalid role: anon" }, true, mode, true), { ok: true });
    assertEquals(decideServiceAuth({ ok: true }, true, mode, true), { ok: true });
    assertEquals(decideServiceAuth({ ok: false, error: "Invalid role: anon" }, false, mode, true), { ok: false, error: "Invalid role: anon" });
  }
});

Deno.test("token com claims de service_role que não é chave conhecida (pode ser forjado)", () => {
  // modo de observação: passa como hoje, mas fica registrado
  assertEquals(decideServiceAuth({ ok: true }, false, "log", true), { ok: true, warn: "would_deny" });
  // modo de bloqueio: recusa
  const enforce = decideServiceAuth({ ok: true }, false, "enforce", true);
  assertEquals(enforce.ok, false);
  assertEquals(enforce.warn, undefined);
});

Deno.test("cofre indisponível não para os jobs: aceita pelas claims e avisa", () => {
  assertEquals(decideServiceAuth({ ok: true }, false, "enforce", false), { ok: true, warn: "vault_unavailable" });
  assertEquals(decideServiceAuth({ ok: true }, false, "log", false), { ok: true, warn: "vault_unavailable" });
  // claims inválidas continuam recusadas mesmo sem o cofre
  assertEquals(decideServiceAuth({ ok: false, error: "Token expired" }, false, "enforce", false).ok, false);
});

Deno.test("SERVICE_AUTH_STRICT: padrão é observar", () => {
  Deno.env.delete("SERVICE_AUTH_STRICT");
  assertEquals(serviceAuthMode(), "log");
  Deno.env.set("SERVICE_AUTH_STRICT", " Enforce ");
  assertEquals(serviceAuthMode(), "enforce");
  Deno.env.set("SERVICE_AUTH_STRICT", "qualquer");
  assertEquals(serviceAuthMode(), "log");
  Deno.env.delete("SERVICE_AUTH_STRICT");
});

Deno.test("isFunctionKeyCall: só a chave exata da função, nunca um JWT com role service_role", async () => {
  const { isFunctionKeyCall } = await import("./auth.ts");
  const prev = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_chave-da-funcao-123");
  try {
    const req = (token: string) => new Request("https://x/functions/v1/y", { headers: { authorization: `Bearer ${token}` } });
    if (!isFunctionKeyCall(req("sb_secret_chave-da-funcao-123"))) throw new Error("chave exata deveria passar");
    if (isFunctionKeyCall(req("sb_secret_chave-da-funcao-124"))) throw new Error("chave diferente não pode passar");
    const forged = `x.${btoa(JSON.stringify({ role: "service_role", iss: "supabase" }))}.y`;
    if (isFunctionKeyCall(req(forged))) throw new Error("JWT forjado não pode passar");
    if (isFunctionKeyCall(new Request("https://x"))) throw new Error("sem token não pode passar");
  } finally {
    if (prev === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY"); else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prev);
  }
});
