import { assertEquals } from "jsr:@std/assert@1";
import { captureRating, parseRatingAnswer, ratingForAgent, ratingQuestion, SUPPORT_RATING_FLAG } from "./support-rating.ts";
import { validateInteractive } from "../whatsapp-interactive.ts";

Deno.test("resposta curta e inequívoca vira avaliação", () => {
  for (const sim of ["Sim", "sim", " SIM ", "sim!", "Sim.", "s", "1", "👍"]) assertEquals(parseRatingAnswer(sim), "yes", sim);
  for (const nao of ["Não", "nao", "NÃO", "não.", "n", "2", "👎"]) assertEquals(parseRatingAnswer(nao), "no", nao);
});

Deno.test("frase que continua a conversa NÃO é avaliação", () => {
  for (const outra of [
    "Sim, mas tenho outra dúvida", "não entendi a data da audiência", "simples assim?", "nao sei", "sim e quando sai o pagamento",
    "obrigado", "", "   ", "12", "3", null, undefined, 1, {},
  ]) {
    assertEquals(parseRatingAnswer(outra), null, String(outra));
  }
});

Deno.test("a pergunta é uma mensagem interativa válida, com dois botões", () => {
  const q = ratingQuestion();
  assertEquals(validateInteractive(q), []);
  assertEquals(q.kind === "buttons" && q.buttons.map((b) => b.title), ["Sim", "Não"]);
  assertEquals(q.body, "Consegui te ajudar?");
});

function deps(open: string | null, recordOk = true, log: string[] = []) {
  return {
    openRating: () => { log.push("open"); return Promise.resolve(open); },
    record: (id: string, answer: "yes" | "no") => { log.push(`record:${id}:${answer}`); return Promise.resolve(recordOk); },
  };
}

Deno.test("sim agradece; não pede desculpa e passa para uma pessoa", async () => {
  const log: string[] = [];
  const sim = await captureRating("Sim", deps("r1", true, log));
  assertEquals(sim?.answer, "yes");
  assertEquals(sim?.handOff, false);
  assertEquals(log, ["open", "record:r1:yes"]);
  const nao = await captureRating("Não", deps("r1"));
  assertEquals(nao?.answer, "no");
  assertEquals(nao?.handOff, true);
});

Deno.test("sem pergunta em aberto, 'sim' é conversa normal e nem consulta o que não precisa", async () => {
  const log: string[] = [];
  assertEquals(await captureRating("sim", deps(null, true, log)), null);
  assertEquals(log, ["open"]);
  // mensagem que não é resposta: nem consulta se há pergunta em aberto
  const log2: string[] = [];
  assertEquals(await captureRating("qual a data da audiência?", deps("r1", true, log2)), null);
  assertEquals(log2, []);
  // já respondida (outra chamada gravou antes): não responde de novo
  assertEquals(await captureRating("sim", deps("r1", false)), null);
});

Deno.test("agente comercial não tem avaliação e nem consulta a flag", async () => {
  for (const tipo of ["sdr", "SDR", "Support", "", null, undefined]) {
    let flag = false, ran = false;
    const out = await ratingForAgent(tipo, () => { flag = true; return Promise.resolve(true); }, () => { ran = true; return Promise.resolve("x"); });
    assertEquals(out, null);
    assertEquals(flag, false, `tipo ${String(tipo)} consultou a flag`);
    assertEquals(ran, false);
  }
});

Deno.test("atendimento só com a flag da organização ligada", async () => {
  const flags: string[] = [];
  assertEquals(await ratingForAgent("support", (f) => { flags.push(f); return Promise.resolve(false); }, () => Promise.resolve("x")), null);
  assertEquals(flags, [SUPPORT_RATING_FLAG]);
  assertEquals(await ratingForAgent("support", () => Promise.resolve(true), () => Promise.resolve("x")), "x");
});
