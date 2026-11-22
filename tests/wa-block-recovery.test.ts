import { assertEquals } from "jsr:@std/assert@1";
import { decideRecovery, withinSendingHours } from "../supabase/functions/_shared/meta-whatsapp/block-recovery.ts";

const now = new Date("2026-11-25T15:00:00Z");
const base = { withAgent: true, threadStatus: "open", doNotContact: false, hasTemplate: true, now };
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

Deno.test("dentro da janela: o agente responde", () => {
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(3) }), "agent_reply");
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(21.9) }), "agent_reply");
});

Deno.test("fora da janela (22 h ou mais): template, se houver; senão fica para a equipe", () => {
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(22) }), "template");
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(72) }), "template");
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(72), hasTemplate: false }), "skipped_no_template");
});

Deno.test("não contatar, conversa encerrada ou com a equipe: não envia", () => {
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(1), doNotContact: true }), "skipped_do_not_contact");
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(1), threadStatus: "resolved" }), "skipped_closed");
  assertEquals(decideRecovery({ ...base, lastInboundAt: hoursAgo(1), withAgent: false }), "skipped_human");
});

Deno.test("template só entre 8h e 20h no fuso do agente", () => {
  assertEquals(withinSendingHours(new Date("2026-11-25T15:00:00Z"), "America/Sao_Paulo"), true);  // 12h
  assertEquals(withinSendingHours(new Date("2026-11-25T23:30:00Z"), "America/Sao_Paulo"), true);  // 20h30
  assertEquals(withinSendingHours(new Date("2026-11-26T00:30:00Z"), "America/Sao_Paulo"), false); // 21h30
  assertEquals(withinSendingHours(new Date("2026-11-25T09:00:00Z"), "America/Sao_Paulo"), false); // 6h
});
