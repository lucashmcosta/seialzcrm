import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  classifySend,
  type ContactInfo,
  type NoticeDeps,
  type NoticeRow,
  processNotice,
  type PushOutcome,
  type SendOutcome,
  type WhatsAppRoute,
  whatsappMode,
} from "./nammux-notice-core.ts";
import {
  type EventState,
  type FinanceState,
  INTERVIEW_REMINDER_1D_TEMPLATE,
  INTERVIEW_REMINDER_KEY,
  NOTICE_TEMPLATES,
  renderEventNotice,
  renderFinanceNotice,
  renderInterviewNotice,
  renderMovementNotice,
  type RenderResult,
} from "./nammux-notice-texts.ts";
import { bearerToken, isInternalToken, sameSecret } from "./internal-auth.ts";

// ---------- textos ----------

const AUD: EventState = {
  event_type: "audiencia", status: "pendente", start_at: "2026-12-10T13:00:00Z", all_day: false,
  timezone: "America/Sao_Paulo", modality: "virtual", location: null,
  virtual_link: "https://exemplo.invalid/sala", removed_at: null,
};
const text = (r: RenderResult) => (r.ok ? r.rendered.text : `RECUSADO:${r.reason}`);

Deno.test("audiência marcada: data, hora de Brasília e link", () => {
  const r = renderEventNotice("event_scheduled", AUD, AUD.start_at);
  assertEquals(text(r), "Olá! Sua audiência foi marcada para quinta-feira, 10/12/2026, às 10:00 (horário de Brasília). É por vídeo, neste link: https://exemplo.invalid/sala Se tiver dúvida, é só responder esta mensagem.");
  // as variáveis do modelo vão na mesma ordem dos {{n}}
  assertEquals(r.ok && r.rendered.variables, ["audiência", "quinta-feira, 10/12/2026", "10:00 (horário de Brasília)", "É por vídeo, neste link: https://exemplo.invalid/sala"]);
});

Deno.test("os sete avisos de agenda, com perícia presencial e entrevista sem local", () => {
  const pericia: EventState = { ...AUD, event_type: "pericia", virtual_link: null, location: "Rua Exemplo, 100, sala 3" };
  const entrevista: EventState = { ...AUD, event_type: "entrevista", virtual_link: null, location: null };
  assertStringIncludes(text(renderEventNotice("event_rescheduled", pericia, pericia.start_at)), "sua perícia mudou de data. A nova data é quinta-feira, 10/12/2026, às 10:00 (horário de Brasília). É presencial, neste local: Rua Exemplo, 100, sala 3");
  assertStringIncludes(text(renderEventNotice("event_reminder_7d", AUD, AUD.start_at)), "Lembrete: sua audiência é quinta-feira, 10/12/2026, às 10:00");
  assertStringIncludes(text(renderEventNotice("event_reminder_1d", AUD, AUD.start_at)), "sua audiência é amanhã, quinta-feira, 10/12/2026");
  assertEquals(text(renderEventNotice("event_reminder_1h", AUD, AUD.start_at)), "Sua audiência começa em 1 hora, às 10:00 (horário de Brasília). É por vídeo, neste link: https://exemplo.invalid/sala Se tiver algum problema, responda esta mensagem.");
  assertEquals(text(renderEventNotice("event_starting", AUD, AUD.start_at)), "Sua audiência está começando agora. Entre o quanto antes para não perder o horário. É por vídeo, neste link: https://exemplo.invalid/sala Se tiver algum problema para entrar, responda esta mensagem.");
  assertStringIncludes(text(renderEventNotice("event_scheduled", entrevista, entrevista.start_at)), "Sua entrevista foi marcada para quinta-feira, 10/12/2026, às 10:00 (horário de Brasília). É por ligação: vamos te ligar nesse horário, então deixe o celular por perto.");
  assertEquals(text(renderEventNotice("event_cancelled", { ...AUD, status: "cancelado" }, AUD.start_at)), "Sua audiência do dia quinta-feira, 10/12/2026 foi cancelada. Assim que houver nova data, avisamos você por aqui.");
});

Deno.test("lembrete não sai com dado velho: remarcada, cancelada ou removida depois de planejado", () => {
  // o aviso foi planejado para 10/12; a audiência agora é dia 17
  assertEquals(text(renderEventNotice("event_reminder_1d", { ...AUD, start_at: "2026-12-17T13:00:00Z" }, AUD.start_at)), "RECUSADO:subject_changed");
  assertEquals(text(renderEventNotice("event_reminder_1h", { ...AUD, status: "cancelado" }, AUD.start_at)), "RECUSADO:subject_gone");
  assertEquals(text(renderEventNotice("event_starting", { ...AUD, removed_at: "2026-12-01T00:00:00Z" }, AUD.start_at)), "RECUSADO:subject_gone");
  // virou dia inteiro (sem hora): lembrete de hora não faz sentido
  assertEquals(text(renderEventNotice("event_reminder_1h", { ...AUD, all_day: true }, AUD.start_at)), "RECUSADO:subject_changed");
  // o link novo entra no lembrete: o texto é montado na hora
  assertStringIncludes(text(renderEventNotice("event_reminder_1h", { ...AUD, virtual_link: "https://exemplo.invalid/NOVA" }, AUD.start_at)), "https://exemplo.invalid/NOVA");
  // dia inteiro: sem hora inventada
  assertStringIncludes(text(renderEventNotice("event_scheduled", { ...AUD, all_day: true }, AUD.start_at)), "às horário a confirmar.");
});

const PARCELA: FinanceState = {
  kind: "installment", status: "paid", number: 2, installments_count: 6, effective_due_date: "2026-12-07",
  due_date: "2026-12-05", paid_on: "2026-12-04", manifestation_due_date: null, homologated_on: null, amount: null, reversed: null,
};

Deno.test("financeiro: pagou, não pagou (com o prazo), homologado, repasse", () => {
  assertEquals(text(renderFinanceNotice("installment_paid", PARCELA)), "A empresa pagou a parcela 2 de 6 do acordo. O escritório vai fazer o repasse da sua parte e avisa você.");
  assertEquals(
    text(renderFinanceNotice("installment_overdue", { ...PARCELA, status: "overdue", manifestation_due_date: "2026-12-14" })),
    "A empresa não pagou a parcela 2 de 6 do acordo, que venceu em 07/12/2026. Vamos nos manifestar no processo em até 5 dias úteis, até 14/12/2026. Qualquer novidade, avisamos você por aqui.",
  );
  assertEquals(
    text(renderFinanceNotice("agreement_homologated", { ...PARCELA, kind: "agreement", homologated_on: "2026-10-08" })),
    "Boa notícia: o juiz homologou o acordo do seu processo em 08/10/2026. Quando houver pagamento, avisamos você por aqui.",
  );
  assertEquals(
    text(renderFinanceNotice("payout_done", { ...PARCELA, kind: "payout", amount: "700.00", paid_on: "2026-12-12", reversed: false })),
    "O repasse de R$ 700,00 referente ao seu processo foi feito em 12/12/2026. Se tiver dúvida, é só responder esta mensagem.",
  );
});

Deno.test("financeiro: o que mudou depois de planejado não é avisado", () => {
  // pagamento estornado antes de o aviso sair
  assertEquals(text(renderFinanceNotice("installment_paid", { ...PARCELA, status: "open" })), "RECUSADO:subject_changed");
  // parcela paga antes de o "não pagou" sair
  assertEquals(text(renderFinanceNotice("installment_overdue", PARCELA)), "RECUSADO:subject_changed");
  assertEquals(text(renderFinanceNotice("payout_done", { ...PARCELA, kind: "payout", amount: 700, paid_on: "2026-12-12", reversed: true })), "RECUSADO:subject_changed");
  // "não pagou" sem o prazo de manifestação não sai pela metade
  assertEquals(text(renderFinanceNotice("installment_overdue", { ...PARCELA, status: "overdue" })), "RECUSADO:missing_data");
});

Deno.test("movimentação usa o texto do catálogo; entrevista recusada cita o horário pedido", () => {
  assertEquals(text(renderMovementNotice("movement_update", { text: "Começou a fase de cálculo." })), "Novidade no seu processo: Começou a fase de cálculo. Se tiver dúvida, é só responder esta mensagem.");
  assertEquals(text(renderMovementNotice("movement_update", { text: "  " })), "RECUSADO:missing_data");
  assertStringIncludes(
    text(renderInterviewNotice("interview_slot_unavailable", { status: "rejected", requested_start_at: "2026-12-01T17:00:00Z" })),
    "(terça-feira, 01/12/2026 às 14:00) acabou de ser ocupado",
  );
  assertEquals(text(renderInterviewNotice("interview_slot_unavailable", { status: "confirmed", requested_start_at: "2026-12-01T17:00:00Z" })), "RECUSADO:subject_changed");
});

Deno.test("véspera da entrevista: modelo próprio, com os botões de presença", () => {
  const entrevista: EventState = { ...AUD, event_type: "entrevista", virtual_link: null, location: null };
  const r = renderEventNotice("event_reminder_1d", entrevista, entrevista.start_at);
  assertEquals(r.ok && r.rendered.templateKey, INTERVIEW_REMINDER_KEY);
  assertEquals(r.ok && r.rendered.buttons, ["Vou participar", "Preciso remarcar"]);
  assertStringIncludes(text(r), "sua entrevista com a equipe do escritório é amanhã, quinta-feira, 10/12/2026, às 10:00");
  assertEquals(text(r).includes("advogad"), false);
  // audiência continua no modelo comum, sem botão
  const a = renderEventNotice("event_reminder_1d", AUD, AUD.start_at);
  assertEquals(a.ok && (a.rendered.templateKey ?? null), null);
  assertEquals(a.ok && (a.rendered.buttons ?? null), null);
});

Deno.test("modelo da Meta não começa nem termina com variável", () => {
  for (const [kind, tpl] of [...Object.entries(NOTICE_TEMPLATES), [INTERVIEW_REMINDER_KEY, INTERVIEW_REMINDER_1D_TEMPLATE]]) {
    if (/^\s*\{\{\d+\}\}/.test(tpl) || /\{\{\d+\}\}[\s.!?]*$/.test(tpl)) throw new Error(`modelo de ${kind} começa ou termina com variável`);
  }
});

Deno.test("variável de modelo sai sem quebra de linha; todo tipo tem modelo", () => {
  const r = renderMovementNotice("movement_update", { text: "Linha um.\nLinha dois.\t  Fim." });
  assertEquals(r.ok && r.rendered.variables, ["Linha um. Linha dois. Fim."]);
  // Os convites de entrevista são texto fixo, igual para todos (sem variável).
  const fixed = new Set(["interview_invite", "interview_invite_reminder", "interview_last_call"]);
  for (const [kind, tpl] of Object.entries(NOTICE_TEMPLATES)) {
    if (!fixed.has(kind) && !tpl.includes("{{1}}")) throw new Error(`modelo de ${kind} sem variável`);
  }
});

// ---------- decisão de envio ----------

const NOTICE: NoticeRow = {
  id: "aviso-1", organization_id: "org", contact_id: "contato", kind: "event_reminder_1h",
  subject_type: "event", subject_id: "ev", subject_start_at: AUD.start_at, expires_at: "2026-12-10T12:40:00Z",
};
const ROTA: WhatsAppRoute = { endpointId: "ep", provider: "meta_cloud_api", windowOpen: false, templateId: "tpl" };

interface Cenario {
  now?: string;
  contact?: Partial<ContactInfo>;
  render?: RenderResult;
  push?: PushOutcome;
  route?: WhatsAppRoute | null;
  sends?: SendOutcome[];
}
async function rodar(c: Cenario) {
  const log: string[] = [];
  const sends = [...(c.sends ?? [{ kind: "sent", messageId: "msg-1" } as SendOutcome])];
  const deps: NoticeDeps = {
    now: () => new Date(c.now ?? "2026-12-10T12:00:00Z"),
    loadContact: () => Promise.resolve({ exists: true, doNotContact: false, hasPhone: true, ...c.contact }),
    render: () => Promise.resolve(c.render ?? renderEventNotice("event_reminder_1h", AUD, AUD.start_at)),
    sendPush: () => { log.push("push"); return Promise.resolve(c.push ?? "not_configured"); },
    whatsappRoute: () => Promise.resolve(c.route === undefined ? ROTA : c.route),
    sendWhatsApp: (_n, _r, mode) => { log.push(`whatsapp:${mode}`); return Promise.resolve(sends.shift() ?? { kind: "unknown" }); },
    finish: (_n, outcome, reason, channel, messageId) => {
      log.push(`fim:${outcome}${reason ? `:${reason}` : ""}${channel ? `@${channel}` : ""}${messageId ? `#${messageId}` : ""}`);
      return Promise.resolve();
    },
  };
  const out = await processNotice(NOTICE, deps);
  return { out, log };
}

Deno.test("sem aplicativo configurado: vai pelo modelo de WhatsApp e registra a mensagem", async () => {
  const { log } = await rodar({});
  assertEquals(log, ["push", "whatsapp:template", "fim:sent@whatsapp_template#msg-1"]);
});

Deno.test("cliente com o aplicativo: push, e o WhatsApp nem é tentado", async () => {
  const { log } = await rodar({ push: "delivered" });
  assertEquals(log, ["push", "fim:sent@app_push"]);
});

Deno.test("aplicativo sem aparelho ou com recusa definida: cai para o WhatsApp", async () => {
  assertEquals((await rodar({ push: "no_device" })).log, ["push", "whatsapp:template", "fim:sent@whatsapp_template#msg-1"]);
  assertEquals((await rodar({ push: "failed" })).log, ["push", "whatsapp:template", "fim:sent@whatsapp_template#msg-1"]);
});

Deno.test("resultado incerto NUNCA reenvia nem troca de canal: vai para uma pessoa", async () => {
  // push sem resposta: pode ter chegado. Não manda WhatsApp por cima.
  assertEquals((await rodar({ push: "unknown" })).log, ["push", "fim:needs_review:unknown_outcome@app_push"]);
  // WhatsApp sem resposta
  assertEquals((await rodar({ sends: [{ kind: "unknown" }] })).log, ["push", "whatsapp:template", "fim:needs_review:unknown_outcome@whatsapp_template"]);
});

Deno.test("recusa definida do provedor volta para a fila (com o código)", async () => {
  assertEquals((await rodar({ sends: [{ kind: "rejected", code: "rate_limited" }] })).log,
    ["push", "whatsapp:template", "fim:retry:rate_limited@whatsapp_template"]);
});

Deno.test("problema de modelo não adianta repetir: para e fica visível", async () => {
  assertEquals((await rodar({ sends: [{ kind: "rejected", code: "template_not_approved" }] })).log,
    ["push", "whatsapp:template", "fim:skipped:template_problem:template_not_approved@whatsapp_template"]);
});

Deno.test("janela de 24 h aberta: texto livre; fechada e sem modelo: não envia", async () => {
  assertEquals((await rodar({ route: { ...ROTA, windowOpen: true } })).log, ["push", "whatsapp:text", "fim:sent@whatsapp_text#msg-1"]);
  assertEquals((await rodar({ route: { ...ROTA, templateId: null } })).log, ["push", "fim:skipped:no_template"]);
  // Evolution não tem janela nem modelo
  assertEquals((await rodar({ route: { ...ROTA, provider: "evolution_api", templateId: null } })).log, ["push", "whatsapp:text", "fim:sent@whatsapp_text#msg-1"]);
});

Deno.test("a janela fechou entre a consulta e o envio: o texto foi recusado e sai pelo modelo", async () => {
  const r = await rodar({ route: { ...ROTA, windowOpen: true }, sends: [{ kind: "rejected", code: "conversation_window_closed" }, { kind: "sent", messageId: "msg-2" }] });
  assertEquals(r.log, ["push", "whatsapp:text", "whatsapp:template", "fim:sent@whatsapp_template#msg-2"]);
  // sem modelo para cair
  const semModelo = await rodar({ route: { ...ROTA, windowOpen: true, templateId: null }, sends: [{ kind: "rejected", code: "conversation_window_closed" }] });
  assertEquals(semModelo.log, ["push", "whatsapp:text", "fim:skipped:no_template@whatsapp_text"]);
});

Deno.test("antes de qualquer envio: prazo, contato e estado atual", async () => {
  // "começa em 1 hora" pego depois do prazo: não envia
  assertEquals((await rodar({ now: "2026-12-10T12:50:00Z" })).log, ["fim:expired:expired_before_send"]);
  assertEquals((await rodar({ contact: { doNotContact: true } })).log, ["fim:skipped:do_not_contact"]);
  assertEquals((await rodar({ contact: { exists: false } })).log, ["fim:skipped:contact_gone"]);
  assertEquals((await rodar({ render: { ok: false, reason: "subject_changed" } })).log, ["fim:cancelled:subject_changed"]);
  assertEquals((await rodar({ render: { ok: false, reason: "subject_gone" } })).log, ["fim:cancelled:subject_gone"]);
  assertEquals((await rodar({ render: { ok: false, reason: "missing_data" } })).log, ["fim:skipped:missing_data"]);
  // sem telefone e sem número de atendimento
  assertEquals((await rodar({ contact: { hasPhone: false } })).log, ["push", "fim:skipped:no_phone"]);
  assertEquals((await rodar({ route: null })).log, ["push", "fim:skipped:no_channel"]);
  // quem pediu para não ser contatado não recebe nem push
  assertEquals((await rodar({ contact: { doNotContact: true }, push: "delivered" })).log, ["fim:skipped:do_not_contact"]);
});

Deno.test("resultado do envio: enviado, recusado (com código) ou incerto", () => {
  assertEquals(classifySend({ data: { success: true, messageId: "m1" }, error: null }), { kind: "sent", messageId: "m1" });
  assertEquals(classifySend({ data: { success: false, error: "blocked" }, error: null }), { kind: "rejected", code: "blocked" });
  assertEquals(classifySend({ data: null, error: { message: "template_not_approved", details: { error: "template_not_approved" } } }), { kind: "rejected", code: "template_not_approved" });
  assertEquals(classifySend({ data: null, error: { message: "sem endpoint", name: "thread_lookup_failed" } }), { kind: "rejected", code: "thread_lookup_failed" });
  assertEquals(classifySend({ data: null, error: { message: "HTTP 403", details: {} } }), { kind: "rejected", code: "http_4xx" });
  // nestes a mensagem pode ter saído
  assertEquals(classifySend({ data: null, error: { message: "HTTP 500", details: {} } }), { kind: "unknown" });
  assertEquals(classifySend({ data: null, error: { message: "The signal has been aborted" } }), { kind: "unknown" });
  assertEquals(classifySend({ data: null, error: { message: "error sending request" } }), { kind: "unknown" });
});

Deno.test("modo do WhatsApp", () => {
  assertEquals(whatsappMode(ROTA), "template");
  assertEquals(whatsappMode({ ...ROTA, windowOpen: true }), "text");
  assertEquals(whatsappMode({ ...ROTA, templateId: null }), null);
  assertEquals(whatsappMode({ ...ROTA, provider: "evolution_api", templateId: null }), "text");
  assertEquals(whatsappMode({ ...ROTA, provider: "twilio", templateId: null, windowOpen: false }), null);
});

// ---------- autenticação interna ----------

Deno.test("token forjado com role service_role NÃO passa; só a chave exata", () => {
  const chave = "sb_secret_chave_interna_de_teste_0123456789";
  const cofre = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura-verdadeira";
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  const forjado = `${b64({ alg: "HS256" })}.${b64({ role: "service_role", iss: "supabase", ref: "qualquer" })}.assinatura-inventada`;
  assertEquals(isInternalToken(forjado, [chave, cofre]), false);
  assertEquals(isInternalToken(chave, [chave, cofre]), true);
  assertEquals(isInternalToken(cofre, [chave, cofre]), true);
  // mesmo corpo do JWT verdadeiro, outra assinatura
  assertEquals(isInternalToken(cofre.replace("assinatura-verdadeira", "assinatura-trocada--"), [chave, cofre]), false);
  // sem chave conhecida, ninguém passa — nem token vazio contra chave vazia
  assertEquals(isInternalToken(chave, []), false);
  assertEquals(isInternalToken("", ["", null, undefined]), false);
  assertEquals(isInternalToken("x", ["", null, undefined]), false);
});

Deno.test("leitura do cabeçalho e comparação", () => {
  const req = (h?: string) => new Request("https://x.invalid", { headers: h ? { authorization: h } : {} });
  assertEquals(bearerToken(req("Bearer abc")), "abc");
  assertEquals(bearerToken(req("bearer   abc ")), "abc");
  assertEquals(bearerToken(req("Basic abc")), "");
  assertEquals(bearerToken(req()), "");
  assertEquals(sameSecret("abc", "abc"), true);
  assertEquals(sameSecret("abc", "abd"), false);
  assertEquals(sameSecret("abc", "abcd"), false);
  assertEquals(sameSecret("", ""), false);
});

Deno.test("aviso de tribunal em outro fuso diz a hora local e a de Brasília", () => {
  const r = renderEventNotice("event_scheduled", { ...AUD, timezone: "America/Campo_Grande" }, AUD.start_at);
  assertEquals(r.ok && r.rendered.variables[2], "09:00 (horário de Campo Grande; 10:00 no horário de Brasília)");
  const lembrete = renderEventNotice("event_reminder_1h", { ...AUD, timezone: "America/Manaus" }, AUD.start_at);
  assertStringIncludes(text(lembrete), "às 09:00 (horário de Manaus; 10:00 no horário de Brasília)");
});

Deno.test("entrevista por ligação: texto de ligação, e o \"começando\" usa modelo próprio", () => {
  const ent = { event_type: "entrevista", status: "pendente", start_at: "2026-12-10T13:00:00Z", all_day: false, timezone: "America/Sao_Paulo", modality: null, location: null, virtual_link: null, removed_at: null };
  const r1h = renderEventNotice("event_reminder_1h", ent, ent.start_at);
  assertStringIncludes(r1h.ok ? r1h.rendered.text : "", "vamos te ligar");
  const st = renderEventNotice("event_starting", ent, ent.start_at);
  assertEquals(st.ok && st.rendered.templateKey, "interview_starting_call");
  assertEquals(st.ok && st.rendered.variables, []);
  assertStringIncludes(st.ok ? st.rendered.text : "", "Vamos te ligar nos próximos minutos");
  // Entrevista com link continua com o texto de vídeo.
  const vid = renderEventNotice("event_starting", { ...ent, virtual_link: "https://exemplo.invalid/sala" }, ent.start_at);
  assertEquals(vid.ok && vid.rendered.templateKey, undefined);
});
