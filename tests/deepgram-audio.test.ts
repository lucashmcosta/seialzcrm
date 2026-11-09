import { assertEquals } from "jsr:@std/assert@1";
import { audioContentType, deepgramAudioQuery, parseDeepgramAudio } from "../supabase/functions/_shared/intelligence/deepgram-audio.ts";

Deno.test("pede português do Brasil, com pontuação e sem converter número", () => {
  const q = new URLSearchParams(deepgramAudioQuery("nova-3"));
  assertEquals(q.get("model"), "nova-3");
  assertEquals(q.get("language"), "pt-BR");
  assertEquals(q.get("punctuate"), "true");
  assertEquals(q.get("smart_format"), "false");
  assertEquals(q.get("numerals"), "false");
});

Deno.test("lê texto, duração e o modelo que o Deepgram usou", () => {
  const out = parseDeepgramAudio({
    metadata: { duration: 12.5, model_info: { abc: { name: "general-nova-3" } } },
    results: { channels: [{ alternatives: [{ transcript: " Olá, tudo bem? " }] }] },
  }, "nova-3");
  assertEquals(out, { text: "Olá, tudo bem?", durationSec: 12.5, model: "general-nova-3" });
});

Deno.test("resposta incompleta não quebra: texto vazio e modelo pedido", () => {
  assertEquals(parseDeepgramAudio({}, "nova-3"), { text: "", durationSec: 0, model: "nova-3" });
  assertEquals(parseDeepgramAudio(null, "nova-2"), { text: "", durationSec: 0, model: "nova-2" });
});

Deno.test("tipo de mídia estranho vira ogg; áudio real é mantido", () => {
  assertEquals(audioContentType("audio/mpeg"), "audio/mpeg");
  assertEquals(audioContentType("audio/ogg; codecs=opus"), "audio/ogg; codecs=opus");
  assertEquals(audioContentType("application/octet-stream"), "audio/ogg");
  assertEquals(audioContentType(""), "audio/ogg");
  assertEquals(audioContentType(null), "audio/ogg");
});
