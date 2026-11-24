import { assertEquals } from "jsr:@std/assert@1";
import { countSlotsWithin, outreachQuota, outreachRate } from "./nammux-interview-outreach-quota.ts";
import { captureOutreachReply, parseOutreachAnswer } from "./nammux-interview-outreach-reply.ts";
import { INTERVIEW_BOOK, INTERVIEW_TALK_TEAM, NOTICE_TEMPLATES, renderInterviewOutreachNotice } from "./nammux-notice-texts.ts";

Deno.test("quota: agenda vazia convida mais, agenda cheia convida menos", () => {
  // 90 horários livres, nada no ar, taxa padrão 35% → 72 / 0,35 → teto 60
  assertEquals(outreachQuota({ freeSlots: 90, pending: 0, invited: 0, converted: 0 }).quota, 60);
  // 20 livres, 0 no ar → 16 / 0,35 = 46
  assertEquals(outreachQuota({ freeSlots: 20, pending: 0, invited: 0, converted: 0 }).quota, 46);
  // 20 livres, 40 convites no ar (≈ 14 marcações esperadas) → (16 - 14) / 0,35 = 6
  assertEquals(outreachQuota({ freeSlots: 20, pending: 40, invited: 0, converted: 0 }).quota, 6);
  // agenda lotada ou já coberta pelos convites no ar → 0
  assertEquals(outreachQuota({ freeSlots: 0, pending: 0, invited: 0, converted: 0 }).quota, 0);
  assertEquals(outreachQuota({ freeSlots: 10, pending: 50, invited: 0, converted: 0 }).quota, 0);
});

Deno.test("quota: usa a taxa medida quando há amostra", () => {
  assertEquals(outreachRate(5, 5), 0.35);
  assertEquals(outreachRate(20, 10), 0.5);
  assertEquals(outreachRate(20, 0), 0.1);
  assertEquals(outreachRate(20, 20), 0.8);
  // taxa 50%: 20 livres → 16 / 0,5 = 32
  assertEquals(outreachQuota({ freeSlots: 20, pending: 0, invited: 20, converted: 10 }).quota, 32);
});

Deno.test("conta só horários dos próximos dias", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const slots = [
    { start_at: "2026-11-24T11:00:00Z" }, // passou
    { start_at: "2026-11-25T12:00:00Z" },
    { start_at: "2026-11-30T12:00:00Z" },
    { start_at: "2026-12-05T12:00:00Z" }, // depois de 7 dias
  ];
  assertEquals(countSlotsWithin(slots, now), 2);
});

Deno.test("texto do convite: só sai se o processo ainda espera", () => {
  const r = renderInterviewOutreachNotice("interview_invite", true);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.rendered.text, NOTICE_TEMPLATES.interview_invite);
    assertEquals(r.rendered.variables, []);
    assertEquals(r.rendered.buttons, [INTERVIEW_BOOK]);
  }
  const last = renderInterviewOutreachNotice("interview_last_call", true);
  if (last.ok) assertEquals(last.rendered.buttons, [INTERVIEW_BOOK, INTERVIEW_TALK_TEAM]);
  assertEquals(renderInterviewOutreachNotice("interview_invite_reminder", false), { ok: false, reason: "subject_changed" });
  assertEquals(renderInterviewOutreachNotice("event_reminder_1d", true), { ok: false, reason: "kind_mismatch" });
  // Sem nome nem dado do cliente no texto.
  for (const k of ["interview_invite", "interview_invite_reminder", "interview_last_call"] as const) {
    assertEquals(/\{\{\d+\}\}/.test(NOTICE_TEMPLATES[k]), false);
  }
});

Deno.test("botões do convite viram nota para o agente, só com convite recente", async () => {
  assertEquals(parseOutreachAnswer("Quero marcar"), "book");
  assertEquals(parseOutreachAnswer("  quero marcar! "), "book");
  assertEquals(parseOutreachAnswer("Falar com a equipe"), "team");
  assertEquals(parseOutreachAnswer("quero marcar uma consulta amanhã"), null);
  const yes = { recentOutreach: () => Promise.resolve(true) };
  const no = { recentOutreach: () => Promise.resolve(false) };
  assertEquals((await captureOutreachReply("Quero marcar", yes))?.outcome, "interview_outreach_book");
  assertEquals((await captureOutreachReply("Falar com a equipe", yes))?.outcome, "interview_outreach_team");
  assertEquals(await captureOutreachReply("Quero marcar", no), null);
});
