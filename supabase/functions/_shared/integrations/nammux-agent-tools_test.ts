import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildNammuxInterviewTools,
  INTERVIEW_SCHEDULE_TOOL,
  INTERVIEW_SLOTS_TOOL,
  NAMMUX_INTERVIEW_FLAG,
  type NammuxSlots,
  type NammuxToolDeps,
  nammuxToolsForAgent,
  parseSlots,
  pickProcess,
  scheduleMessage,
  slotsMessage,
} from "./nammux-agent-tools.ts";
import { nammuxFunctionUrl } from "./nammux-client.ts";

const CTX = { supabase: { from: () => ({}), storage: {} }, organizationId: "org", isTestMode: false, history: [] };
const S1 = "2026-12-01T17:00:00.000Z"; // terça, 14:00 em Brasília
const S2 = "2026-12-02T12:00:00.000Z"; // quarta, 09:00

function deps(over: Partial<NammuxToolDeps> = {}, log: string[] = []): NammuxToolDeps {
  const slots: NammuxSlots = {
    enabled: true, timezone: "America/Sao_Paulo", current: null,
    slots: [{ start_at: S1, end_at: "2026-12-01T18:00:00.000Z" }, { start_at: S2, end_at: null }],
  };
  return {
    isTestMode: false,
    listProcesses: () => Promise.resolve([{ opportunity_id: "opp-1" }]),
    fetchSlots: (opp) => { log.push(`slots:${opp}`); return Promise.resolve(slots); },
    requestInterview: (opp, start, end) => { log.push(`request:${opp}:${start}:${end}`); return Promise.resolve("requested"); },
    ...over,
  };
}
const tool = (d: NammuxToolDeps, name: string) => buildNammuxInterviewTools(d).find((t) => t.name === name)!;

Deno.test("agente comercial não recebe as ferramentas e nem consulta a flag", async () => {
  for (const tipo of ["sdr", "SDR", "Support", "support ", "", null, undefined]) {
    let flag = false, built = false;
    const tools = await nammuxToolsForAgent(tipo, () => { flag = true; return Promise.resolve(true); }, () => { built = true; return buildNammuxInterviewTools(deps()); });
    assertEquals(tools.length, 0, `tipo ${String(tipo)} recebeu ferramenta`);
    assertEquals(flag, false, `tipo ${String(tipo)} consultou a flag`);
    assertEquals(built, false);
  }
});

Deno.test("agente de atendimento só recebe com a flag da organização ligada", async () => {
  const flags: string[] = [];
  const off = await nammuxToolsForAgent("support", (f) => { flags.push(f); return Promise.resolve(false); }, () => buildNammuxInterviewTools(deps()));
  assertEquals(off.length, 0);
  assertEquals(flags, [NAMMUX_INTERVIEW_FLAG]);
  const on = await nammuxToolsForAgent("support", () => Promise.resolve(true), () => buildNammuxInterviewTools(deps()));
  assertEquals(on.map((t) => t.name), [INTERVIEW_SLOTS_TOOL, INTERVIEW_SCHEDULE_TOOL]);
  // a instrução entra uma vez só no prompt
  assertEquals(on.map((t) => t.prompt).join("").split("## AGENDAMENTO DE ENTREVISTA").length - 1, 1);
});

Deno.test("escolha do processo: um só, vários sem número, número fora do intervalo", () => {
  assertEquals(pickProcess([{ opportunity_id: "a" }], undefined), { ref: { opportunity_id: "a" } });
  assertEquals("message" in pickProcess([], undefined), true);
  const varios = [{ opportunity_id: "a" }, { opportunity_id: "b" }];
  assertEquals("message" in pickProcess(varios, undefined), true);
  assertEquals(pickProcess(varios, 2), { ref: { opportunity_id: "b" } });
  assertEquals("message" in pickProcess(varios, 3), true);
  assertEquals("message" in pickProcess(varios, 0), true);
  assertEquals("message" in pickProcess(varios, "dois"), true);
});

Deno.test("resposta do Nammux fora do contrato não vira horário", () => {
  assertEquals(parseSlots(null), null);
  assertEquals(parseSlots({ enabled: true }), null);
  const r = parseSlots({
    enabled: true, timezone: "America/Sao_Paulo", current: { start_at: "2026-11-30T12:00:00Z" },
    slots: [{ start_at: "2026-12-01T17:00:00Z", end_at: "2026-12-01T18:00:00Z" }, { start_at: "não é data" }, "lixo", { end_at: "2026-12-01T18:00:00Z" }],
  });
  assertEquals(r?.slots, [{ start_at: S1, end_at: "2026-12-01T18:00:00.000Z" }]);
  assertEquals(r?.current, "2026-11-30T12:00:00.000Z");
  assertEquals(parseSlots({ slots: [], enabled: "sim" })?.enabled, false);
});

Deno.test("mensagem dos horários: lista com o start_at exato e manda não inventar", () => {
  const msg = slotsMessage({
    enabled: true, timezone: "America/Sao_Paulo", current: "2026-11-30T12:00:00.000Z",
    slots: [{ start_at: S1, end_at: null }, { start_at: S2, end_at: null }],
  });
  assertStringIncludes(msg, "1. terça-feira, 01/12/2026 às 14:00 (horário de Brasília) — start_at: 2026-12-01T17:00:00.000Z");
  assertStringIncludes(msg, "2. quarta-feira, 02/12/2026 às 09:00 (horário de Brasília) — start_at: 2026-12-02T12:00:00.000Z");
  assertStringIncludes(msg, "já tem entrevista marcada para segunda-feira, 30/11/2026 às 09:00");
  assertStringIncludes(msg, "REMARCA");
  assertStringIncludes(msg, "Não ofereça horário que não esteja nesta lista");
  assertStringIncludes(slotsMessage(null), "Não consegui consultar a agenda");
  assertStringIncludes(slotsMessage({ enabled: false, timezone: "America/Sao_Paulo", current: null, slots: [] }), "não está aberta");
  assertStringIncludes(slotsMessage({ enabled: true, timezone: "America/Sao_Paulo", current: null, slots: [] }), "Não há horário livre");
});

Deno.test("consultar horários chama o Nammux para o processo do cliente", async () => {
  const log: string[] = [];
  const out = await tool(deps({}, log), INTERVIEW_SLOTS_TOOL).run({}, CTX);
  assertEquals(log, ["slots:opp-1"]);
  assertStringIncludes(out.modelMessage, "Horários livres para a entrevista");
  assertEquals(out.clientText ?? null, null);
});

Deno.test("agendar: confere o horário de novo e grava o pedido uma vez", async () => {
  const log: string[] = [];
  const out = await tool(deps({}, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: "2026-12-01T17:00:00Z" }, CTX);
  assertEquals(log, ["slots:opp-1", `request:opp-1:${S1}:2026-12-01T18:00:00.000Z`]);
  assertStringIncludes(out.modelMessage, "Pedido de entrevista enviado para terça-feira, 01/12/2026 às 14:00");
  assertStringIncludes(out.modelMessage, "Não diga que já está confirmado");
});

Deno.test("agendar: horário que não está na agenda não gera pedido", async () => {
  for (const startAt of ["2026-12-01T17:30:00Z", "2026-12-25T17:00:00Z", "amanhã às 14h", "", undefined]) {
    const log: string[] = [];
    const out = await tool(deps({}, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: startAt }, CTX);
    assertEquals(log.some((l) => l.startsWith("request:")), false, `pedido gravado para ${String(startAt)}`);
    assertEquals(out.modelMessage.includes("Pedido de entrevista enviado"), false);
  }
});

Deno.test("agendar: agenda fechada, Nammux fora do ar e cliente com vários processos", async () => {
  const log: string[] = [];
  const fechada = await tool(deps({ fetchSlots: () => Promise.resolve({ enabled: false, timezone: "America/Sao_Paulo", current: null, slots: [] }) }, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: S1 }, CTX);
  assertStringIncludes(fechada.modelMessage, "não está aberta");
  const fora = await tool(deps({ fetchSlots: () => Promise.resolve(null) }, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: S1 }, CTX);
  assertStringIncludes(fora.modelMessage, "Não consegui consultar a agenda");
  const varios = await tool(deps({ listProcesses: () => Promise.resolve([{ opportunity_id: "a" }, { opportunity_id: "b" }]) }, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: S1 }, CTX);
  assertStringIncludes(varios.modelMessage, "process_number");
  assertEquals(log.some((l) => l.startsWith("request:")), false);
});

Deno.test("agendar no modo de teste não envia nada ao escritório", async () => {
  const log: string[] = [];
  const out = await tool(deps({ isTestMode: true }, log), INTERVIEW_SCHEDULE_TOOL).run({ start_at: S1 }, CTX);
  assertEquals(log.some((l) => l.startsWith("request:")), false);
  assertStringIncludes(out.modelMessage, "modo de teste");
});

Deno.test("resultado do pedido: nunca diz que está marcado quando não foi", () => {
  assertStringIncludes(scheduleMessage("requested", "terça"), "Pedido de entrevista enviado para terça");
  assertStringIncludes(scheduleMessage("already_requested", "terça"), "já foi pedido");
  assertStringIncludes(scheduleMessage("no_process", "terça"), "não tem processo");
  for (const ruim of [null, "", "qualquer"]) {
    assertStringIncludes(scheduleMessage(ruim, "terça"), "Não diga que foi marcado");
  }
});

Deno.test("URL da função no Nammux: mesmo projeto, só host permitido", () => {
  assertEquals(
    nammuxFunctionUrl("https://rqnbnbbbmhtynuhecavv.supabase.co/functions/v1/seialz-webhook-ingest", "seialz-interview-slots")?.toString(),
    "https://rqnbnbbbmhtynuhecavv.supabase.co/functions/v1/seialz-interview-slots",
  );
  assertEquals(nammuxFunctionUrl("https://rqnbnbbbmhtynuhecavv.supabase.co/functions/v1/seialz-webhook-ingest?x=1", "seialz-interview-slots")?.search, "");
  assertEquals(nammuxFunctionUrl("https://exemplo.invalid/functions/v1/seialz-webhook-ingest", "seialz-interview-slots"), null);
  assertEquals(nammuxFunctionUrl("http://rqnbnbbbmhtynuhecavv.supabase.co/functions/v1/x", "seialz-interview-slots"), null);
  assertEquals(nammuxFunctionUrl("https://rqnbnbbbmhtynuhecavv.supabase.co/outra/coisa", "seialz-interview-slots"), null);
  assertEquals(nammuxFunctionUrl("https://rqnbnbbbmhtynuhecavv.supabase.co/functions/v1/x", "../admin"), null);
  assertEquals(nammuxFunctionUrl("", "seialz-interview-slots"), null);
});
