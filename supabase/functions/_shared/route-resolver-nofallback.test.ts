// Barreira estática anti-fallback do caminho canônico V2.
//
// Contrato atual: a resposta sai pelo endpoint da ÚLTIMA MENSAGEM VÁLIDA da
// conversa (inbound OU outbound). É PROIBIDO qualquer fallback por
// primary_endpoint_id, purpose ou provider default. O default legado da Route
// (`active_endpoint_id`) só é permitido para conversa SEM nenhuma mensagem.
//
// Este teste falha se esses termos aparecerem em CÓDIGO (fora de comentários)
// nos dois arquivos do caminho V2.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FILES = [
  new URL("./route-resolver.ts", import.meta.url),
  new URL("./reply-endpoint-selection.ts", import.meta.url),
  new URL("../../../src/lib/salesReplyRoute.ts", import.meta.url),
];

// A definição de "última mensagem válida" pode viver no módulo compartilhado
// (`reply-endpoint-selection.ts`) ou no próprio arquivo; a barreira exige que
// as DUAS direções apareçam no conjunto do caminho V2.
const DIRECTION_FILES = FILES;

const FORBIDDEN = [
  "primary_endpoint_id",
  "purpose",
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

for (const url of FILES) {
  Deno.test(`NF ${url.pathname.split("/").pop()} sem fallback proibido`, async () => {
    const code = stripComments(await Deno.readTextFile(url));
    for (const term of FORBIDDEN) {
      assert(
        !code.includes(term),
        `Termo proibido "${term}" encontrado em código de ${url.pathname}`,
      );
    }
    // provider default proibido: nenhum coalesce/fallback para "twilio"
    assert(
      !/(\?\?|\|\|)\s*"twilio"/.test(code),
      `Provider default "twilio" usado como fallback em ${url.pathname}`,
    );

  });
}

Deno.test("NF seleção derivada considera inbound E outbound", async () => {
  const all = (
    await Promise.all(DIRECTION_FILES.map((u) => Deno.readTextFile(u)))
  ).map(stripComments).join("\n");
  assert(all.includes('"inbound"'), "Consulta à inbound ausente no caminho V2");
  assert(all.includes('"outbound"'), "Consulta a outbound ausente no caminho V2");
});
