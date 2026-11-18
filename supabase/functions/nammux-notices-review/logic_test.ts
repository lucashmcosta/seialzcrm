import { assertEquals } from "jsr:@std/assert@1";
import { canApprove, decideErrorCode, parseRequest } from "./logic.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const AVISO = "22222222-2222-4222-8222-222222222222";

Deno.test("pedido: listar e decidir; o resto é recusado", () => {
  assertEquals(parseRequest({ op: "list", organizationId: ORG }), { op: "list", organizationId: ORG });
  assertEquals(
    parseRequest({ op: "decide", organizationId: ORG, noticeId: AVISO, approve: false, reason: "  já avisei por telefone " }),
    { op: "decide", organizationId: ORG, noticeId: AVISO, approve: false, reason: "já avisei por telefone" },
  );
  assertEquals(parseRequest({ op: "decide", organizationId: ORG, noticeId: AVISO, approve: true }),
    { op: "decide", organizationId: ORG, noticeId: AVISO, approve: true, reason: null });
  assertEquals(parseRequest({ op: "list" }), null);
  assertEquals(parseRequest({ op: "list", organizationId: "não é uuid" }), null);
  assertEquals(parseRequest({ op: "decide", organizationId: ORG, noticeId: AVISO }), null);
  assertEquals(parseRequest({ op: "decide", organizationId: ORG, noticeId: AVISO, approve: "sim" }), null);
  assertEquals(parseRequest({ op: "decide", organizationId: ORG, noticeId: "x", approve: true }), null);
  assertEquals(parseRequest({ op: "decide", organizationId: ORG, noticeId: AVISO, approve: true, reason: "x".repeat(301) }), null);
  assertEquals(parseRequest({ op: "apagar", organizationId: ORG }), null);
  assertEquals(parseRequest(null), null);
});

Deno.test("só é aprovável o aviso que ainda pode sair", () => {
  const agora = new Date("2026-12-10T12:00:00Z");
  assertEquals(canApprove("pending_approval", null, "2026-12-11T00:00:00Z", agora), true);
  assertEquals(canApprove("needs_review", "unknown_outcome", null, agora), true);
  assertEquals(canApprove("dead_letter", "attempts_exhausted", null, agora), true);
  // fora do prazo
  assertEquals(canApprove("pending_approval", null, "2026-12-10T11:00:00Z", agora), false);
  // já saiu e ficou desmentido: só baixa
  assertEquals(canApprove("needs_review", "payment_reversed_after_sent", null, agora), false);
  // parou por falta de modelo, já saiu, etc.
  assertEquals(canApprove("skipped", "no_template", null, agora), false);
  assertEquals(canApprove("sent", null, null, agora), false);
});

Deno.test("erro da decisão vira código para a tela", () => {
  assertEquals(decideErrorCode("NAMMUX_NOTICE_SEM_PERMISSAO"), { status: 403, code: "forbidden" });
  assertEquals(decideErrorCode("NAMMUX_NOTICE_NAO_ENCONTRADO"), { status: 404, code: "not_found" });
  assertEquals(decideErrorCode("NAMMUX_NOTICE_JA_DECIDIDO"), { status: 409, code: "already_decided" });
  assertEquals(decideErrorCode("NAMMUX_NOTICE_NAO_REENVIAVEL"), { status: 409, code: "not_resendable" });
  assertEquals(decideErrorCode("qualquer outra coisa"), { status: 500, code: "decide_failed" });
  assertEquals(decideErrorCode(null), { status: 500, code: "decide_failed" });
});
