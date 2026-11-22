import { assert, assertEquals } from "jsr:@std/assert@1";
import { healthAlert, summarizeHealth } from "../supabase/functions/_shared/meta-whatsapp/health.ts";

const phone = (quality: string) => ({ quality_rating: quality, status: "CONNECTED", messaging_limit_tier: "TIER_2K" });
const health = (canSend: string, errors: unknown[] = []) => ({
  can_send_message: canSend,
  entities: [{ entity_type: "WABA", id: "1", can_send_message: canSend, errors }],
});

Deno.test("resume número + health_status da WABA, com os motivos da Meta", () => {
  const h = summarizeHealth(phone("red"), health("BLOCKED", [{ error_code: 141009, error_description: "Conta restrita.", possible_solution: "Peça revisão." }]));
  assertEquals(h.quality_rating, "RED");
  assertEquals(h.can_send_message, "BLOCKED");
  assertEquals(h.messaging_limit_tier, "TIER_2K");
  assertEquals(h.health_errors, [{ entity_type: "WABA", error_code: 141009, error_description: "Conta restrita.", possible_solution: "Peça revisão." }]);
});

Deno.test("resposta incompleta da Meta não quebra nem inventa situação", () => {
  const h = summarizeHealth(null, undefined);
  assertEquals(h, { quality_rating: null, phone_status: null, messaging_limit_tier: null, can_send_message: null, health_errors: [] });
  assertEquals(summarizeHealth(phone("GREEN"), { can_send_message: "QUALQUER" }).can_send_message, null);
});

Deno.test("primeira verificação: avisa só se já estiver ruim", () => {
  assertEquals(healthAlert(null, summarizeHealth(phone("GREEN"), health("AVAILABLE"))), null);
  const a = healthAlert(null, summarizeHealth(phone("RED"), health("BLOCKED")), "+55 11 95507-4839");
  assertEquals(a?.kind, "worse");
  assertEquals(a?.title, "WhatsApp: a Meta bloqueou o envio");
  assert(a!.body.startsWith("Número +55 11 95507-4839: "));
});

Deno.test("envio piorou (liberado → limitado → bloqueado) avisa; igual não repete", () => {
  const limited = summarizeHealth(phone("GREEN"), health("LIMITED"));
  assertEquals(healthAlert({ can_send_message: "AVAILABLE", quality_rating: "GREEN" }, limited)?.title, "WhatsApp: a Meta limitou o envio");
  const blocked = summarizeHealth(phone("GREEN"), health("BLOCKED"));
  assertEquals(healthAlert({ can_send_message: "LIMITED", quality_rating: "GREEN" }, blocked)?.title, "WhatsApp: a Meta bloqueou o envio");
  assertEquals(healthAlert({ can_send_message: "BLOCKED", quality_rating: "GREEN" }, blocked), null);
});

Deno.test("qualidade caiu avisa; continuar igual não repete", () => {
  const yellow = summarizeHealth(phone("YELLOW"), health("AVAILABLE"));
  assertEquals(healthAlert({ can_send_message: "AVAILABLE", quality_rating: "GREEN" }, yellow)?.title, "WhatsApp: a qualidade do número caiu");
  assertEquals(healthAlert({ can_send_message: "AVAILABLE", quality_rating: "YELLOW" }, yellow), null);
});

Deno.test("recuperação também avisa (envio liberado de novo, qualidade melhorou)", () => {
  const ok = summarizeHealth(phone("GREEN"), health("AVAILABLE"));
  assertEquals(healthAlert({ can_send_message: "BLOCKED", quality_rating: "GREEN" }, ok)?.kind, "better");
  assertEquals(healthAlert({ can_send_message: "AVAILABLE", quality_rating: "RED" }, ok)?.title, "WhatsApp: a qualidade do número melhorou");
});

Deno.test("UNKNOWN ou dado ausente não gera aviso", () => {
  const unknown = summarizeHealth(phone("UNKNOWN"), {});
  assertEquals(healthAlert({ can_send_message: "AVAILABLE", quality_rating: "GREEN" }, unknown), null);
});
