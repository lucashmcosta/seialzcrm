import { assertEquals } from "jsr:@std/assert@1";
import { notaCertificacao } from "./logic.ts";
Deno.test("nota nula vira texto padrão", () => {
  assertEquals(notaCertificacao(null, "Ana"), "Certificado na entrevista por Ana");
  assertEquals(notaCertificacao("  ", "Ana"), "Certificado na entrevista por Ana");
});
Deno.test("nota preenchida é mantida", () => {
  assertEquals(notaCertificacao(" Sem testemunha ", "Ana"), "Sem testemunha");
});
