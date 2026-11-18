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
