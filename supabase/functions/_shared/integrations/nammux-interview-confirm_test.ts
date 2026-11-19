import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  captureInterviewConfirmation,
  type InterviewConfirmDeps,
  type InterviewProposal,
  parseInterviewAnswer,
  SLOT_TAKEN_NOTE,
} from "./nammux-interview-confirm.ts";
import type { NammuxSlots } from "./nammux-agent-tools.ts";

const S1 = "2026-12-01T17:00:00.000Z"; // terça, 14:00 em Brasília
const PROP: InterviewProposal = { id: "p1", opportunity_id: "opp-1", requested_start_at: "2026-12-01T17:00:00+00:00", requested_end_at: null };
const OPEN: NammuxSlots = { enabled: true, timezone: "America/Sao_Paulo", current: null, slots: [{ start_at: S1, end_at: "2026-12-01T17:30:00.000Z" }] };

function deps(over: Partial<InterviewConfirmDeps> = {}, log: string[] = []): InterviewConfirmDeps {
  return {
    openProposal: () => Promise.resolve(PROP),
    closeProposal: (id, status) => { log.push(`close:${id}:${status}`); return Promise.resolve(true); },
    fetchSlots: (opp) => { log.push(`slots:${opp}`); return Promise.resolve(OPEN); },
    requestInterview: (opp, start, end) => { log.push(`request:${opp}:${start}:${end}`); return Promise.resolve("requested"); },
    ...over,
  };
}

Deno.test("leitura do toque: só resposta curta e inequívoca", () => {
  for (const t of ["Confirmar", "confirmar.", " CONFIRMO ", "1"]) assertEquals(parseInterviewAnswer(t), "confirm", t);
  for (const t of ["Outro horário", "outro horario", "2"]) assertEquals(parseInterviewAnswer(t), "other", t);
  for (const t of ["sim", "ok", "confirmar mas pode ser mais cedo?", "", null, 3]) assertEquals(parseInterviewAnswer(t), null, String(t));
});

Deno.test("confirmar: confere a agenda de novo e só então pede ao escritório", async () => {
  const log: string[] = [];
  const r = await captureInterviewConfirmation("Confirmar", deps({}, log));
  assertEquals(log, ["close:p1:accepted", "slots:opp-1", `request:opp-1:${S1}:2026-12-01T17:30:00.000Z`]);
  assertEquals(r?.kind, "reply");
  if (r?.kind === "reply") {
    assertStringIncludes(r.text, "terça-feira, 01/12/2026 às 14:00");
    assertEquals(r.handOff, false);
  }
});

Deno.test("sem proposta aberta, ou já fechada, a mensagem segue para o agente", async () => {
  const log: string[] = [];
  assertEquals(await captureInterviewConfirmation("Confirmar", deps({ openProposal: () => Promise.resolve(null) }, log)), null);
  assertEquals(await captureInterviewConfirmation("Confirmar", deps({ closeProposal: () => Promise.resolve(false) }, log)), null);
  assertEquals(await captureInterviewConfirmation("bom dia", deps({}, log)), null);
  assertEquals(log.some((l) => l.startsWith("request:")), false);
});

Deno.test("outro horário: fecha a proposta e o agente oferece outros", async () => {
  const log: string[] = [];
  const r = await captureInterviewConfirmation("Outro horário", deps({}, log));
  assertEquals(log, ["close:p1:declined"]);
  assertEquals(r, { kind: "continue", note: null, outcome: "interview_other" });
});

Deno.test("horário ocupado antes do toque: nada é pedido e o agente oferece outros", async () => {
  for (const fresh of [{ ...OPEN, slots: [] }, { ...OPEN, enabled: false }, null]) {
    const log: string[] = [];
    const r = await captureInterviewConfirmation("1", deps({ fetchSlots: () => Promise.resolve(fresh) }, log));
    assertEquals(log.some((l) => l.startsWith("request:")), false);
    assertEquals(r?.kind, "continue");
    if (r?.kind === "continue") assertEquals(r.note, SLOT_TAKEN_NOTE);
  }
});

Deno.test("pedido que falha passa para a equipe e não diz que marcou", async () => {
  const r = await captureInterviewConfirmation("Confirmar", deps({ requestInterview: () => Promise.resolve(null) }));
  assertEquals(r?.kind, "reply");
  if (r?.kind === "reply") {
    assertEquals(r.handOff, true);
    assertEquals(r.text.includes("Pronto"), false);
  }
});
