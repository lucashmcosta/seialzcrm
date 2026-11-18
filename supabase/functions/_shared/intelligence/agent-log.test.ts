import { assertEquals } from "jsr:@std/assert@1";
import { emptyResponseShape, providerForIntegration, toolArgKeys } from "./agent-log.ts";

Deno.test("log de ferramenta leva os nomes dos campos, nunca os valores", () => {
  const args = { full_name: "NOME DO CLIENTE", phone: "+5511999990000", email: "cliente@exemplo.invalid" };
  const keys = toolArgKeys(args);
  assertEquals(keys, ["email", "full_name", "phone"]);
  const noLog = JSON.stringify(keys);
  for (const valor of Object.values(args)) {
    if (noLog.includes(valor)) throw new Error("valor do argumento foi para o log");
  }
  assertEquals(toolArgKeys(null), []);
  assertEquals(toolArgKeys("texto"), []);
  assertEquals(toolArgKeys(["a"]), []);
});

Deno.test("resposta vazia do modelo vira resumo sem texto nem argumentos", () => {
  const shape = emptyResponseShape({
    role: "assistant", content: "", refusal: null,
    tool_calls: [{ function: { name: "update_contact", arguments: '{"full_name":"NOME DO CLIENTE"}' } }],
  });
  assertEquals(shape, { role: "assistant", has_content: false, has_refusal: false, tool_calls: ["update_contact"] });
  if (JSON.stringify(shape).includes("NOME DO CLIENTE")) throw new Error("argumento da ferramenta foi para o log");
  assertEquals(emptyResponseShape(null), { role: null, has_content: false, has_refusal: false, tool_calls: [] });
});

Deno.test("provedor para precificar o uso", () => {
  assertEquals(providerForIntegration("claude-ai"), "anthropic");
  assertEquals(providerForIntegration("openai-gpt"), "openai");
  assertEquals(providerForIntegration("lovable-ai"), null);
  assertEquals(providerForIntegration(null), null);
});
