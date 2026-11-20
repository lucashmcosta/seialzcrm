import { assertEquals } from "jsr:@std/assert@1";
import { matchClientToProcess, processPartyName } from "./client-name-match.ts";
import { type NoticeDeps, type NoticeRow, processNotice } from "./nammux-notice-core.ts";

// Nomes fictícios.
Deno.test("parte do processo a partir do título", () => {
  assertEquals(processPartyName("MARIA SOUZA LIMA x EMPRESA EXEMPLO LTDA"), "MARIA SOUZA LIMA");
  assertEquals(processPartyName("Maria Souza × Empresa Exemplo"), "Maria Souza");
  assertEquals(processPartyName("MARIA SOUZA XEMPRESA EXEMPLO LTDA"), "MARIA SOUZA");
  assertEquals(processPartyName("(CANCELADO) Maria Souza xEmpresa"), "Maria Souza");
  assertEquals(processPartyName("Oportunidade - Maria"), "Maria");
  assertEquals(processPartyName(null), null);
});

Deno.test("mesma pessoa: passa", () => {
  assertEquals(matchClientToProcess("Maria Souza Lima", "MARIA SOUZA LIMA x EMPRESA LTDA"), "match");
  assertEquals(matchClientToProcess("JOSÉ DA SILVA", "Jose da Silva × Empresa"), "match");
  // erro de digitação no primeiro nome
  assertEquals(matchClientToProcess("TALLES ROCHA PINTO", "TALES ROCHA PINTO x EMPRESA"), "match");
  // primeiro nome abreviado no cadastro, sobrenomes iguais
  assertEquals(matchClientToProcess("M. SOUZA LIMA", "MARIA SOUZA LIMA x EMPRESA"), "match");
  // título provisório com o primeiro nome
  assertEquals(matchClientToProcess("Pedro Alves Rocha", "Oportunidade - Pedro"), "match");
});

Deno.test("pessoas diferentes: barra", () => {
  // só um sobrenome comum não basta
  assertEquals(matchClientToProcess("ANTONIO PEREIRA DA SILVA", "CARLOS DA SILVA MOURA x EMPRESA"), "mismatch");
  assertEquals(matchClientToProcess("Paulo Cruz Rocha", "BRUNO HENRIQUE GOMES X FULANO DOS SANTOS"), "mismatch");
});

Deno.test("sem nome de um dos lados: não dá para saber, não barra", () => {
  assertEquals(matchClientToProcess("Maria Souza", "Oportunidade - 😎"), "unknown");
  assertEquals(matchClientToProcess("Maria Souza", "Oportunidade - ."), "unknown");
  assertEquals(matchClientToProcess("🥷", "MARIA SOUZA x EMPRESA"), "unknown");
  assertEquals(matchClientToProcess(null, "MARIA SOUZA x EMPRESA"), "unknown");
  assertEquals(matchClientToProcess("Maria Souza", null), "unknown");
});

const NOTICE: NoticeRow = {
  id: "n1", organization_id: "org", contact_id: "c1", opportunity_id: "o1", kind: "event_reminder_7d",
  subject_type: "event", subject_id: "ev", subject_start_at: null, expires_at: null,
};
async function rodar(name: string, title: string, approved_at: string | null = null) {
  const log: string[] = [];
  const deps: NoticeDeps = {
    now: () => new Date("2026-12-01T12:00:00Z"),
    loadContact: () => Promise.resolve({ exists: true, doNotContact: false, hasPhone: true, name, processTitle: title }),
    render: () => { log.push("render"); return Promise.resolve({ ok: false, reason: "subject_gone" }); },
    sendPush: () => Promise.resolve("not_configured"),
    whatsappRoute: () => Promise.resolve(null),
    sendWhatsApp: () => Promise.resolve({ kind: "unknown" }),
    finish: (_n, outcome, reason) => { log.push(`fim:${outcome}${reason ? `:${reason}` : ""}`); return Promise.resolve(); },
  };
  await processNotice({ ...NOTICE, approved_at }, deps);
  return log;
}

Deno.test("aviso para quem não é a parte do processo vai para revisão, sem enviar", async () => {
  assertEquals(await rodar("ANTONIO PEREIRA DA SILVA", "CARLOS DA SILVA MOURA x EMPRESA"), ["fim:needs_review:contact_name_mismatch"]);
});

Deno.test("nome confere: segue o fluxo normal", async () => {
  assertEquals(await rodar("Carlos da Silva Moura", "CARLOS DA SILVA MOURA x EMPRESA"), ["render", "fim:cancelled:subject_gone"]);
});

Deno.test("aprovado por uma pessoa na revisão: não barra de novo", async () => {
  assertEquals(await rodar("ANTONIO PEREIRA DA SILVA", "CARLOS DA SILVA MOURA x EMPRESA", "2026-12-01T11:00:00Z"), ["render", "fim:cancelled:subject_gone"]);
});
