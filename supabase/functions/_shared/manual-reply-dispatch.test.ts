// ============================================================================
// Matriz cross-provider do switch "Responder por".
//
// Prova que o override manual participa da RESOLUÇÃO DE PROVIDER antes do
// roteamento para a function específica, e que sem o campo nada muda
// (zero queries extras, provider automático preservado).
// ============================================================================

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveProvider, providerFunctionName } from "./dispatch-whatsapp-send.ts";

let ORG = "org-1";
let orgSeq = 0;
function nextOrg() { orgSeq += 1; ORG = `org-${orgSeq}`; return ORG; }
const THREAD = "thread-1";
const USER = "user-1";

type Row = Record<string, any>;

interface FakeState {
  endpoints: Row[];
  flags: Row[];
  lines: Row[];
  links: Row[];
  messages: Row[];
  threads: Row[];
  evolution: Row[];
  grants: Row[];
  queries: string[];
}

function makeClient(state: FakeState) {
  const filter = (rows: Row[], eqs: [string, any][]) =>
    rows.filter((r) => eqs.every(([k, v]) => r[k] === v));

  function table(name: string) {
    state.queries.push(`from:${name}`);
    const eqs: [string, any][] = [];
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => {
        eqs.push([k, v]);
        return api;
      },
      in: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
      not: () => api,
      maybeSingle: async () => {
        const rows = filter((state as any)[name] ?? [], eqs);
        return { data: rows[0] ?? null, error: null };
      },
      then: (res: any) => {
        const rows = filter((state as any)[name] ?? [], eqs);
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return api;
  }

  return {
    from: (name: string) => {
      const map: Record<string, string> = {
        communication_endpoints: "endpoints",
        feature_flags: "flags",
        messaging_lines: "lines",
        messaging_line_endpoints: "links",
        messages: "messages",
        message_threads: "threads",
        evolution_instances: "evolution",
        user_reply_endpoints: "grants",
      };
      return table(map[name] ?? name);
    },
    rpc: async (fn: string, _args: unknown) => {
      state.queries.push(`rpc:${fn}`);
      if (fn === "fn_feature_flag_enabled") {
        const key = (_args as any)?._flag_key;
        const row = state.flags.find((f) => f.name === key);
        const orgs = (row?.organization_ids ?? []) as string[];
        const ok = !!row && row.is_enabled === true &&
          (orgs.length === 0 || orgs.includes((_args as any)?._organization_id));
        return { data: ok, error: null };
      }
      if (fn === "fn_is_canonical_sales_thread") return { data: true, error: null };
      if (fn === "fn_is_sales_eligible_endpoint") return { data: true, error: null };
      return { data: null, error: null };
    },
  } as any;
}

function baseState(opts: {
  manualFlagOn: boolean;
  routeFlagOn: boolean;
  autoProvider: "meta_cloud_api" | "twilio" | "evolution_api";
  manualProvider?: "meta_cloud_api" | "twilio" | "evolution_api";
}): FakeState {
  const autoEp = "ep-auto";
  const manualEp = "ep-manual";
  const endpoints: Row[] = [
    {
      id: autoEp,
      organization_id: ORG,
      channel: "whatsapp",
      is_active: true,
      provider: opts.autoProvider,
      external_address: "+5511999990000",
      purpose: "commercial",
    },
  ];
  if (opts.manualProvider) {
    endpoints.push({
      id: manualEp,
      organization_id: ORG,
      channel: "whatsapp",
      is_active: true,
      provider: opts.manualProvider,
      external_address: "+5511988887777",
      purpose: "commercial",
    });
  }
  return {
    endpoints,
    flags: [
      {
        name: "sales_manual_reply_endpoint_v1",
        is_enabled: opts.manualFlagOn,
        organization_ids: [],
      },
      {
        name: "conv_route_resolver_v2",
        is_enabled: opts.routeFlagOn,
        organization_ids: [],
      },
    ],
    lines: [
      {
        id: "line-1",
        organization_id: ORG,
        key: "commercial",
        channel: "whatsapp",
        is_active: true,
        active_endpoint_id: autoEp,
      },
    ],
    links: [{ line_id: "line-1", endpoint_id: autoEp, is_active: true }],
    messages: [],
    threads: [
      {
        id: THREAD,
        organization_id: ORG,
        business_context: "sales",
        channel: "whatsapp",
        merged_into_thread_id: null,
        primary_endpoint_id: autoEp,
      },
    ],
    evolution: [
      {
        organization_id: ORG,
        endpoint_id: manualEp,
        instance_name: "inst-1",
        last_known_state: "open",
        owner_number_digits: "5511988887777",
      },
    ],
    grants: [{ id: "g1", organization_id: ORG, user_id: USER, endpoint_id: manualEp }],
    queries: [],
  };
}

async function runCase(
  autoProvider: "meta_cloud_api" | "twilio" | "evolution_api",
  manualProvider: "meta_cloud_api" | "twilio" | "evolution_api",
) {
  nextOrg();
  const state = baseState({
    manualFlagOn: true,
    routeFlagOn: true,
    autoProvider,
    manualProvider,
  });
  const payload: any = {
    organizationId: ORG,
    threadId: THREAD,
    userId: USER,
    senderContext: "messages",
    businessContext: "sales",
    manualReplyEndpointId: "ep-manual",
  };
  const resolved = await resolveProvider(makeClient(state), payload);
  return { resolved, payload, state };
}

Deno.test("AUTO_META_MANUAL_EVOLUTION chama evolution-whatsapp-send", async () => {
  const { resolved, payload } = await runCase("meta_cloud_api", "evolution_api");
  assertEquals(resolved.provider, "evolution_api");
  assertEquals(resolved.source, "manual_reply_override");
  assertEquals(payload.endpointId, "ep-manual");
  assertEquals(providerFunctionName(resolved.provider), "evolution-whatsapp-send");
});

Deno.test("AUTO_META_MANUAL_TWILIO chama twilio-whatsapp-send", async () => {
  const { resolved, payload } = await runCase("meta_cloud_api", "twilio");
  assertEquals(resolved.provider, "twilio");
  assertEquals(payload.endpointId, "ep-manual");
  assertEquals(providerFunctionName(resolved.provider), "twilio-whatsapp-send");
});

Deno.test("AUTO_EVOLUTION_MANUAL_META chama meta-whatsapp-send", async () => {
  const { resolved, payload } = await runCase("evolution_api", "meta_cloud_api");
  assertEquals(resolved.provider, "meta_cloud_api");
  assertEquals(payload.endpointId, "ep-manual");
  assertEquals(providerFunctionName(resolved.provider), "meta-whatsapp-send");
});

Deno.test("AUTO_TWILIO_MANUAL_META chama meta-whatsapp-send", async () => {
  const { resolved, payload } = await runCase("twilio", "meta_cloud_api");
  assertEquals(resolved.provider, "meta_cloud_api");
  assertEquals(payload.endpointId, "ep-manual");
  assertEquals(providerFunctionName(resolved.provider), "meta-whatsapp-send");
});

Deno.test("MANUAL_REPLY_FEATURE_DISABLED quando a flag está OFF", async () => {
  nextOrg();
  const state = baseState({
    manualFlagOn: false,
    routeFlagOn: true,
    autoProvider: "meta_cloud_api",
    manualProvider: "evolution_api",
  });
  const payload: any = {
    organizationId: ORG,
    threadId: THREAD,
    userId: USER,
    senderContext: "messages",
    businessContext: "sales",
    manualReplyEndpointId: "ep-manual",
  };
  let code: string | null = null;
  try {
    await resolveProvider(makeClient(state), payload);
  } catch (e) {
    code = (e as any).code ?? null;
  }
  assertEquals(code, "MANUAL_REPLY_FEATURE_DISABLED");
});

Deno.test("NO_MANUAL_FIELD_EXTRA_QUERY=0 e AUTO_PROVIDER_BEHAVIOR_UNCHANGED", async () => {
  nextOrg();
  const withField = baseState({
    manualFlagOn: true,
    routeFlagOn: false,
    autoProvider: "meta_cloud_api",
    manualProvider: "evolution_api",
  });
  const withoutField = baseState({
    manualFlagOn: true,
    routeFlagOn: false,
    autoProvider: "meta_cloud_api",
    manualProvider: "evolution_api",
  });

  const basePayload = {
    organizationId: ORG,
    threadId: THREAD,
    userId: USER,
    senderContext: "messages",
    businessContext: "sales",
  };

  const autoResolved = await resolveProvider(makeClient(withoutField), { ...basePayload } as any);
  const manualQueries = (await (async () => {
    await resolveProvider(makeClient(withField), {
      ...basePayload,
      manualReplyEndpointId: "ep-manual",
    } as any);
    return withField.queries;
  })());

  // Sem o campo: nenhuma query do caminho manual.
  const manualOnly = withoutField.queries.filter((q) =>
    q === "rpc:fn_is_canonical_sales_thread" ||
    q === "rpc:fn_is_sales_eligible_endpoint" ||
    q === "from:grants"
  );
  assertEquals(manualOnly.length, 0, "NO_MANUAL_FIELD_EXTRA_QUERY deve ser 0");
  // Com o campo, o caminho manual roda.
  // Grants (`user_reply_endpoints`) não fazem mais parte do caminho manual.
  assertEquals(manualQueries.includes("from:grants"), false);
  // Provider automático inalterado.
  assertEquals(autoResolved.provider, "meta_cloud_api");
});
