import { assertEquals } from "jsr:@std/assert@1";
import { capturePresence, parsePresenceAnswer, PRESENCE_THANKS, RESCHEDULE_NOTE } from "./nammux-interview-presence.ts";

const comLembrete = { recentInterviewReminder: () => Promise.resolve({ noticeId: "n1" }) };
const semLembrete = { recentInterviewReminder: () => Promise.resolve(null) };

Deno.test("leitura da presença: só o botão ou a frase curta", () => {
  for (const t of ["Vou participar", "vou participar!", "VOU SIM"]) assertEquals(parsePresenceAnswer(t), "yes", t);
  for (const t of ["Preciso remarcar", "remarcar"]) assertEquals(parsePresenceAnswer(t), "reschedule", t);
  for (const t of ["sim", "vou participar mas vou atrasar", "", null]) assertEquals(parsePresenceAnswer(t), null, String(t));
});

Deno.test("vou participar: resposta fixa, sem o agente", async () => {
  assertEquals(await capturePresence("Vou participar", comLembrete), { kind: "reply", text: PRESENCE_THANKS, outcome: "interview_presence_yes" });
});

Deno.test("preciso remarcar: o agente oferece outros horários", async () => {
  assertEquals(await capturePresence("Preciso remarcar", comLembrete), { kind: "continue", note: RESCHEDULE_NOTE, outcome: "interview_presence_reschedule" });
});

Deno.test("sem lembrete de entrevista recente, é conversa normal", async () => {
  assertEquals(await capturePresence("Vou participar", semLembrete), null);
  assertEquals(await capturePresence("Preciso remarcar", semLembrete), null);
});
