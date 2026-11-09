import { assertEquals } from "jsr:@std/assert@1";
import { effectiveContent } from "../supabase/functions/_shared/intelligence/audio-content.ts";

Deno.test("áudio usa a transcrição no lugar de [Áudio]", () => {
  assertEquals(
    effectiveContent({ content: "[Áudio]", mediaType: "audio", transcript: " Quero o plano. " }),
    { content: "Quero o plano.", source: "transcript" },
  );
});

Deno.test("áudio sem transcrição não tem o que analisar", () => {
  assertEquals(effectiveContent({ content: "[Áudio]", mediaType: "audio" }), { content: "", source: "none" });
  assertEquals(effectiveContent({ content: "🎵 Áudio", mediaType: "audio/ogg", transcript: "" }), { content: "", source: "none" });
  assertEquals(effectiveContent({ content: "", mediaType: "audio", transcript: null }), { content: "", source: "none" });
});

Deno.test("áudio antigo com texto na própria mensagem continua usando esse texto", () => {
  assertEquals(
    effectiveContent({ content: "Texto já gravado", mediaType: "audio" }),
    { content: "Texto já gravado", source: "message" },
  );
});

Deno.test("mensagem que não é áudio não muda", () => {
  assertEquals(effectiveContent({ content: "Oi", mediaType: null, transcript: "ignorar" }), { content: "Oi", source: "message" });
  assertEquals(effectiveContent({ content: "Foto", mediaType: "image" }), { content: "Foto", source: "message" });
});
