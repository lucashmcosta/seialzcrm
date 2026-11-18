import { assertEquals } from "jsr:@std/assert@1";
import {
  buildServiceReportUserPrompt,
  buildServiceSystemPrompt,
  buildServiceUserPrompt,
  SERVICE_REPORT_SCHEMA,
  SERVICE_SCHEMA,
} from "../supabase/functions/_shared/intelligence/service-analysis.ts";
import { normalizeProfile } from "../supabase/functions/_shared/intelligence/analysis-profile.ts";

function requiredMatchesProperties(schema: any): boolean {
  if (schema?.type === "object") {
    const keys = Object.keys(schema.properties ?? {});
    if (JSON.stringify([...keys].sort()) !== JSON.stringify([...(schema.required ?? [])].sort())) return false;
    if (schema.additionalProperties !== false) return false;
    return keys.every((k) => requiredMatchesProperties(schema.properties[k]));
  }
  if (schema?.type === "array") return requiredMatchesProperties(schema.items);
  return true;
}

Deno.test("esquemas do atendimento: todo campo obrigatório e nada além deles", () => {
  assertEquals(requiredMatchesProperties(SERVICE_SCHEMA), true);
  assertEquals(requiredMatchesProperties(SERVICE_REPORT_SCHEMA), true);
});

Deno.test("prompt do atendimento lê a conversa inteira e pergunta o que o agente resolveria", () => {
  const p = buildServiceSystemPrompt(normalizeProfile({ preset: "juridico" }));
  assertEquals(p.includes("UMA conversa inteira"), true);
  assertEquals(p.includes("ai_agent_fit"), true);
  assertEquals(p.includes("advocacia"), true);
  assertEquals(buildServiceSystemPrompt(normalizeProfile(null)).includes("já compraram"), true);
});

Deno.test("conversa e relatório do atendimento", () => {
  const u = buildServiceUserPrompt({ assigned_name: null, first_message_at: "a", last_message_at: "b" }, "[01/11 10:00] Cliente: oi");
  assertEquals(u.includes("sem responsável"), true);
  assertEquals(u.endsWith("Cliente: oi"), true);
  const r = buildServiceReportUserPrompt([{ thread_id: "1234567890abcdef", assigned_name: "Ana", message_count: 3, last_inbound_at: null, analysis: { x: 1 } }]);
  assertEquals(r.includes('"codigo":"12345678"'), true);
  assertEquals(r.startsWith("1 conversas"), true);
});

Deno.test("relatório do atendimento leva a análise enxuta", () => {
  const long = "x".repeat(1000);
  const r = buildServiceReportUserPrompt([{ thread_id: "abcdefgh1234", assigned_name: null, message_count: 1, last_inbound_at: null, analysis: {
    summary: long, contacts: [{ reason: "case_status", client_asked: long, team_answer: long, resolved: "no", wait_until_first_answer: "2 dias" }],
    main_bottleneck: { category: "no_case_information", detail: long }, complaint: { complained: false, about: "", quote: "" },
    waiting_at_end: { client_waiting: true, for_what: "andamento" }, client_mood_at_end: "anxious", team_behaviors: [],
    ai_agent_fit: { could_handle: "part", could_answer: ["andamento"], information_needed: ["andamento"], must_stay_with_people: [] },
    key_moments: [{ when: "x", what: long }], confidence: "high",
  } }]);
  assertEquals(r.length < 1500, true);
  assertEquals(r.includes('"tipo":"no_case_information"'), true);
  assertEquals(r.includes("key_moments"), false);
});
