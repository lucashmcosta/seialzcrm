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
  new URL("../../../src/lib/salesReplyRoute.ts", import.meta.url),
];

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

    // A seleção derivada considera as duas direções da conversa.
    assert(code.includes('"inbound"'), `Consulta à inbound ausente em ${url.pathname}`);
    assert(code.includes('"outbound"'), `Consulta a outbound ausente em ${url.pathname}`);
  });
}
