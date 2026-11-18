import { assertEquals } from "jsr:@std/assert@1";
import { notaCertificacao } from "./logic.ts";
Deno.test("nota nula vira texto padrão", () => {
  assertEquals(notaCertificacao(null, "Ana"), "Certificado na entrevista por Ana");
  assertEquals(notaCertificacao("  ", "Ana"), "Certificado na entrevista por Ana");
});
Deno.test("nota preenchida é mantida", () => {
  assertEquals(notaCertificacao(" Sem testemunha ", "Ana"), "Sem testemunha");
});
Deno.test("log de entrada usa a chave única da tabela", async () => {
  const { INBOUND_LOG_CONFLICT } = await import("./logic.ts");
  assertEquals(INBOUND_LOG_CONFLICT, "organization_id,direction,external_event_id");
});

Deno.test("retrato mais velho do mesmo processo é ignorado", async () => {
  const { retratoDesatualizado } = await import("./logic.ts");
  const atual = { source_updated_at: "2026-11-10T12:00:00Z", external_process_id: "proc-a" };
  assertEquals(retratoDesatualizado(atual, { sourceUpdatedAt: "2026-11-09T12:00:00Z", externalProcessId: "proc-a" }), true);
  assertEquals(retratoDesatualizado(atual, { sourceUpdatedAt: "2026-11-11T12:00:00Z", externalProcessId: "proc-a" }), false);
  assertEquals(retratoDesatualizado(atual, { sourceUpdatedAt: "2026-11-10T12:00:00Z", externalProcessId: "proc-a" }), false);
});
Deno.test("troca de processo no mesmo negócio é aceita mesmo com data mais antiga", async () => {
  const { retratoDesatualizado } = await import("./logic.ts");
  const atual = { source_updated_at: "2026-11-10T12:00:00Z", external_process_id: "proc-a" };
  assertEquals(retratoDesatualizado(atual, { sourceUpdatedAt: "2026-09-01T12:00:00Z", externalProcessId: "proc-b" }), false);
});
Deno.test("sem retrato gravado ou sem data, nada é ignorado", async () => {
  const { retratoDesatualizado } = await import("./logic.ts");
  assertEquals(retratoDesatualizado(null, { sourceUpdatedAt: "2026-09-01T12:00:00Z", externalProcessId: "p" }), false);
  assertEquals(retratoDesatualizado({ source_updated_at: null, external_process_id: "p" }, { sourceUpdatedAt: "2026-09-01T12:00:00Z", externalProcessId: "p" }), false);
  assertEquals(retratoDesatualizado({ source_updated_at: "2026-11-10T12:00:00Z", external_process_id: "p" }, { sourceUpdatedAt: null, externalProcessId: "p" }), false);
  // Linha antiga sem o id do processo: mantém o comportamento de sempre.
  assertEquals(retratoDesatualizado({ source_updated_at: "2026-11-10T12:00:00Z" }, { sourceUpdatedAt: "2026-09-01T12:00:00Z", externalProcessId: "p" }), true);
});
