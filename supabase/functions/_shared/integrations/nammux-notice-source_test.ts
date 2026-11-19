import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { eventStateFromSource, renderNoticeFromDb } from "./nammux-notice-render.ts";

const EV = {
  id: "ev-1", type: "audiencia", subtype: "una", status: "pendente", start_at: "2026-12-10T13:00:00Z",
  all_day: false, timezone: "America/Sao_Paulo", modality: "virtual", location: null, virtual_link: "https://exemplo.invalid/sala",
};
const db = { from: () => { throw new Error("aviso pedido pelo Nammux não pode ler o espelho"); } };
const notice = (kind: string, payload: unknown) => ({
  organization_id: "org", kind, subject_type: "source_event", subject_id: "x", subject_start_at: EV.start_at, payload,
});

Deno.test("aviso pedido pelo Nammux: texto sai do que veio, sem ler o espelho", async () => {
  const r = await renderNoticeFromDb(db, notice("event_reminder_1d", EV));
  assertEquals(r.ok, true);
  if (r.ok) assertStringIncludes(r.rendered.text, "sua audiência é amanhã, quinta-feira, 10/12/2026, às 10:00");
});

Deno.test("véspera de entrevista pedida pelo Nammux leva os botões de presença", async () => {
  const r = await renderNoticeFromDb(db, notice("event_reminder_1d", { ...EV, type: "entrevista", virtual_link: null }));
  assertEquals(r.ok && r.rendered.templateKey, "interview_reminder_1d");
  assertEquals(r.ok && r.rendered.buttons, ["Vou participar", "Preciso remarcar"]);
});

Deno.test("cancelamento pedido pelo Nammux sai mesmo com status cancelado", async () => {
  const r = await renderNoticeFromDb(db, notice("event_cancelled", { ...EV, status: "cancelado" }));
  assertEquals(r.ok, true);
});

Deno.test("pedido sem os dados mínimos não vira texto", async () => {
  for (const p of [null, {}, { ...EV, start_at: "amanhã" }, { ...EV, type: "" }, { ...EV, status: null }]) {
    assertEquals(eventStateFromSource(p), null);
    const r = await renderNoticeFromDb(db, notice("event_reminder_1d", p));
    assertEquals(r.ok ? "ok" : r.reason, "missing_data");
  }
});
