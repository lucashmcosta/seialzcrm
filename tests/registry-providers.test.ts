import {
  ddmmaaaaToIso,
  isoToDdmmaaaa,
  isValidCnpjValue,
  isValidCpfValue,
  lookupSerproCpfV2,
  lookupSerproCpfV3,
  normalizeCpfBrasilResponse,
  normalizeSerproResponse,
  sanitizeProviderMessage,
} from "../supabase/functions/_shared/registry/providers.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("registry provider guard validates CPF before network calls", () => {
  assertEquals(isValidCpfValue("529.982.247-25"), true);
  assertEquals(isValidCpfValue("529.982.247-24"), false);
  assertEquals(isValidCpfValue("111.111.111-11"), false);
});

Deno.test("registry provider guard validates numeric and alphanumeric CNPJ", () => {
  assertEquals(isValidCnpjValue("04.252.011/0001-10"), true);
  assertEquals(isValidCnpjValue("04.252.011/0001-11"), false);
  assertEquals(isValidCnpjValue("12ABC34501DE35"), true);
  assertEquals(isValidCnpjValue("12ABC34501DE36"), false);
});

Deno.test("CPF Brasil v2 response maps documented identity fields", () => {
  const result = normalizeCpfBrasilResponse(200, {
    success: true,
    data: {
      CPF: "52998224725",
      NOME: "Pessoa de Teste",
      SEXO: "Feminino",
      NASC: "30/11/1899",
      NOME_MAE: "Mãe de Teste",
    },
    meta: { api_version: "2.0" },
  }, "52998224725");

  if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
  assertEquals(result.version, "2.0");
  assertEquals(result.payload.full_name, "Pessoa de Teste");
  assertEquals(result.payload.birth_date, "1899-11-30");
  assertEquals(result.payload.sex, "female");
  assertEquals(result.payload.mother_name, "Mãe de Teste");
});

Deno.test("CPF Brasil v2 maps documented failures without exposing provider messages", () => {
  const expired = normalizeCpfBrasilResponse(401, {
    error: "Unauthorized",
    message: "Sensitive provider message",
    code: "TOKEN_EXPIRED",
  }, "52998224725");
  const notFound = normalizeCpfBrasilResponse(404, {
    code: "CPF_NOT_FOUND",
  }, "52998224725");

  if (expired.ok || notFound.ok) throw new Error("Expected provider failures");
  assertEquals(expired.error, "provider_token_expired");
  assertEquals(expired.retryable, false);
  // CPF_NOT_FOUND = CPF válido porém ausente da base → `not_found` (distinto de
  // MISSING_CPF_PARAMETER/INVALID_CPF_FORMAT, que viram `invalid_or_not_found`).
  assertEquals(notFound.error, "not_found");
  assertEquals(notFound.retryable, false);
});

Deno.test("sanitizeProviderMessage redige PII estruturada (CPF, e-mail, data, dígitos)", () => {
  const out = sanitizeProviderMessage(
    "CPF 529.982.247-25 de fulano@ex.com nasc 01/05/1976 tel 11987654321",
  );
  if (!out) throw new Error("expected string");
  assertEquals(out.includes("529.982.247-25"), false);
  assertEquals(out.includes("fulano@ex.com"), false);
  assertEquals(out.includes("01/05/1976"), false);
  assertEquals(out.includes("11987654321"), false);
  assertEquals(out.includes("[cpf]") && out.includes("[email]") && out.includes("[data]"), true);
  // ISO também
  assertEquals(sanitizeProviderMessage("em 1976-05-01")?.includes("1976-05-01"), false);
});

// --- SERPRO --------------------------------------------------------------

Deno.test("SERPRO date conversions round-trip and reject invalid dates", () => {
  assertEquals(isoToDdmmaaaa("1976-05-01"), "01051976");
  assertEquals(ddmmaaaaToIso("01051976"), "1976-05-01");
  // datas impossíveis
  assertEquals(isoToDdmmaaaa("1976-13-01"), null);
  assertEquals(isoToDdmmaaaa("1976-02-30"), null);
  assertEquals(ddmmaaaaToIso("30021976"), null);
  // formatos errados
  assertEquals(isoToDdmmaaaa("01/05/1976"), null);
  assertEquals(ddmmaaaaToIso("1051976"), null);
  assertEquals(isoToDdmmaaaa(""), null);
  assertEquals(ddmmaaaaToIso(null), null);
});

Deno.test("SERPRO success maps ni/nome/nascimento and keeps situacao raw", () => {
  const result = normalizeSerproResponse(200, {
    ni: "52998224725",
    nome: "PESSOA FISICA DA SILVA",
    situacao: { codigo: "0", descricao: "Regular" },
    nascimento: "01051976",
    dataInscricao: "10051976",
    nomeSocial: "PESSOA FISICA DA SILVA SOCIAL",
  }, "52998224725", "serpro-v3", "1976-05-01");

  if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
  assertEquals(result.provider, "serpro");
  assertEquals(result.payload.cpf, "52998224725");
  assertEquals(result.payload.full_name, "PESSOA FISICA DA SILVA");
  assertEquals(result.payload.registration_status, "Regular");
  // nascimento da resposta é autoritativo
  assertEquals(result.payload.birth_date, "1976-05-01");
  // SERPRO não retorna sexo/nome da mãe neste schema
  assertEquals(result.payload.sex, null);
  assertEquals(result.payload.mother_name, null);
});

Deno.test("SERPRO v2 derives birth_date from response even without input date", () => {
  const result = normalizeSerproResponse(200, {
    ni: "52998224725",
    nome: "Fulano",
    nascimento: "23091983",
  }, "52998224725", "serpro-v2", null);
  if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
  assertEquals(result.payload.birth_date, "1983-09-23");
});

Deno.test("SERPRO maps HTTP failures to internal vocabulary", () => {
  const notFound = normalizeSerproResponse(404, {}, "52998224725", "serpro-v2", null);
  const auth = normalizeSerproResponse(401, {}, "52998224725", "serpro-v2", null);
  const quota = normalizeSerproResponse(429, {}, "52998224725", "serpro-v2", null);
  const upstream = normalizeSerproResponse(503, {}, "52998224725", "serpro-v2", null);

  if (notFound.ok || auth.ok || quota.ok || upstream.ok) {
    throw new Error("Expected provider failures");
  }
  assertEquals(notFound.error, "not_found");
  assertEquals(notFound.retryable, false);
  assertEquals(auth.error, "provider_auth_error");
  assertEquals(quota.error, "provider_quota_exceeded");
  assertEquals(upstream.error, "upstream_error");
  assertEquals(upstream.retryable, true);
});

Deno.test("SERPRO v3 short-circuits on invalid birth date without network", async () => {
  const result = await lookupSerproCpfV3("52998224725", "not-a-date");
  if (result.ok) throw new Error("Expected failure");
  assertEquals(result.error, "invalid_or_not_found");
  assertEquals(result.status, 422);
});

// Roda antes do teste de cache abaixo: precisa do cache de token vazio para
// forçar a emissão do token (e assim exercitar o erro 5xx do endpoint de token).
Deno.test("SERPRO classifies token-endpoint 5xx as transient upstream_error, not auth", async () => {
  Deno.env.set("SERPRO_CONSUMER_KEY", "k");
  Deno.env.set("SERPRO_CONSUMER_SECRET", "s");
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/token")) {
      return Promise.resolve(new Response("upstream down", { status: 503 }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    const result = await lookupSerproCpfV2("52998224725");
    if (result.ok) throw new Error("Expected failure");
    assertEquals(result.error, "upstream_error");
    assertEquals(result.retryable, true);
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("SERPRO_CONSUMER_KEY");
    Deno.env.delete("SERPRO_CONSUMER_SECRET");
  }
});

Deno.test("SERPRO v2 caches token and refreshes once on 401", async () => {
  Deno.env.set("SERPRO_CONSUMER_KEY", "k");
  Deno.env.set("SERPRO_CONSUMER_SECRET", "s");
  const realFetch = globalThis.fetch;
  let tokenCalls = 0;
  let consultaCalls = 0;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/token")) {
      tokenCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: `t${tokenCalls}`, expires_in: 3600 }),
          { status: 200 },
        ),
      );
    }
    consultaCalls += 1;
    if (consultaCalls === 1) {
      return Promise.resolve(new Response("{}", { status: 401 }));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ ni: "52998224725", nome: "Fulano", nascimento: "01051976" }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  try {
    const result = await lookupSerproCpfV2("52998224725");
    if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
    assertEquals(result.payload.full_name, "Fulano");
    assertEquals(result.version, "serpro-v2");
    // token: 1 emissão inicial + 1 renovação forçada após o 401
    assertEquals(tokenCalls, 2);
    assertEquals(consultaCalls, 2);
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("SERPRO_CONSUMER_KEY");
    Deno.env.delete("SERPRO_CONSUMER_SECRET");
  }
});

Deno.test("SERPRO lookups report provider_not_configured without secrets", async () => {
  const before = {
    key: Deno.env.get("SERPRO_CONSUMER_KEY"),
    secret: Deno.env.get("SERPRO_CONSUMER_SECRET"),
  };
  Deno.env.delete("SERPRO_CONSUMER_KEY");
  Deno.env.delete("SERPRO_CONSUMER_SECRET");
  try {
    const result = await lookupSerproCpfV2("52998224725");
    if (result.ok) throw new Error("Expected failure");
    assertEquals(result.error, "provider_not_configured");
    assertEquals(result.retryable, false);
  } finally {
    if (before.key) Deno.env.set("SERPRO_CONSUMER_KEY", before.key);
    if (before.secret) Deno.env.set("SERPRO_CONSUMER_SECRET", before.secret);
  }
});
