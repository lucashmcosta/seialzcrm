import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cpfOutcome, opportunityFieldValues, parseBrDate, parseContractSettings, runSendContract, titleCaseName,
  type ContractToolDeps, type CustomFieldDef,
} from "../supabase/functions/_shared/intelligence/contract-tool.ts";

const DEFS: CustomFieldDef[] = [
  { id: "f1", name: "fato_gerador", label: "Fato Gerador", field_type: "select", options: { options: [{ label: "Nascimento", value: "Nascimento" }, { label: "Gestação", value: "Gestação" }] } },
  { id: "f2", name: "data_fato_gerador", label: "Data do Fato Gerador", field_type: "date", options: null },
];

function fakeDeps(over: Partial<ContractToolDeps> = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const log: string[] = [];
  const deps: ContractToolDeps = {
    isTestMode: false,
    settings: { template_ids: ["tpl-1"], responsible_user_id: null, sent_stage_id: "stage-sent" },
    opportunityFieldDefs: DEFS,
    openOpportunity: async () => ({ id: "opp-1", owner_user_id: "user-1" }),
    existingRequest: async () => null,
    contact: async () => ({ full_name: "Maria Conceição Teste", cpf: "12345678909", email: "maria@example.com", address_zip: "01001000", address_number: "10", address_street: "Rua Exemplo" }),
    cpfVerified: async () => false,
    isUsableAuthor: async () => true,
    verifyCpf: async () => ({ status: 200, body: { ok: true, data: { full_name: "MARIA CONCEICAO TESTE" } } }),
    updateContactName: async (n) => { log.push(`name:${n}`); },
    saveOpportunityFields: async (_id, values) => { log.push(`fields:${values.map((v) => `${v.def.name}=${v.value}`).join(",")}`); },
    callSignature: async (body) => {
      calls.push(body);
      if (body.action === "prepare_contract") return { status: 200, body: { request_id: "req-1" } };
      if (body.action === "send_for_signature") return { status: 200, body: { status: "sent" } };
      if (body.action === "get_signing_link") return { status: 200, body: { signing_url: "https://sign.example/s/abc" } };
      return { status: 400, body: {} };
    },
    clientParticipantId: async () => "part-1",
    moveToStage: async (_o, s) => { log.push(`stage:${s}`); },
    ...over,
  };
  return { deps, calls, log };
}

const ARGS = { opportunity_fields: { fato_gerador: "nascimento", data_fato_gerador: "01/11/2026" } };

Deno.test("caminho completo: confere CPF, grava nome oficial e dados do caso, envia e manda o link", async () => {
  const { deps, calls, log } = fakeDeps();
  const out = await runSendContract(ARGS, deps);
  assertEquals(out.clientText, "Aqui está o seu contrato para assinar: https://sign.example/s/abc");
  assert(out.modelMessage.includes("não escreva o link"));
  assert(out.teamNote);
  assertEquals(calls.map((c) => c.action), ["prepare_contract", "send_for_signature", "get_signing_link"]);
  assertEquals(calls[0].template_ids, ["tpl-1"]);
  assert(calls.every((c) => c.acting_user_id === "user-1"));
  assertEquals(log, ["fields:fato_gerador=Nascimento,data_fato_gerador=2026-11-01", "stage:stage-sent"]);
});

Deno.test("sem configuração: passa para a equipe sem chamar nada", async () => {
  const { deps, calls } = fakeDeps({ settings: null });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("transfer_to_human"));
  assertEquals(calls.length, 0);
});

Deno.test("dado do cadastro faltando: pede só o que falta", async () => {
  const { deps, calls } = fakeDeps({ contact: async () => ({ full_name: "Ana", cpf: "1", email: null, address_zip: "1", address_number: null, address_street: "R" }) });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("e-mail, número da casa"));
  assertEquals(calls.length, 0);
});

Deno.test("CPF sem retorno no verificador principal: pede a data de nascimento e usa na próxima chamada", async () => {
  let sentDate: string | null = "unset";
  const { deps, calls } = fakeDeps({
    verifyCpf: async ({ birthDate }) => {
      sentDate = birthDate;
      return birthDate ? { status: 200, body: { ok: true, data: { full_name: "MARIA CONCEICAO TESTE" } } } : { status: 200, body: { ok: false, error: "birth_date_required", fallback_available: true } };
    },
  });
  const first = await runSendContract(ARGS, deps);
  assert(first.modelMessage.includes("data de nascimento"));
  assertEquals(sentDate, null);
  assertEquals(calls.length, 0);
  const second = await runSendContract({ ...ARGS, birth_date: "01/02/2000" }, deps);
  assertEquals(sentDate, "2000-02-01");
  assert(second.clientText);
});

Deno.test("CPF e data que não batem: pede para conferir, sem gerar", async () => {
  const { deps, calls } = fakeDeps({ verifyCpf: async () => ({ status: 200, body: { ok: false, error: "not_found" } }) });
  const out = await runSendContract({ ...ARGS, birth_date: "01/02/2000" }, deps);
  assert(out.modelMessage.includes("não batem"));
  assertEquals(calls.length, 0);
});

Deno.test("nome que não confere com o CPF: passa para a equipe e não gera", async () => {
  const { deps, calls, log } = fakeDeps({ verifyCpf: async () => ({ status: 200, body: { ok: true, data: { full_name: "JOANA OUTRA PESSOA" } } }) });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("não confere"));
  assertEquals(calls.length, 0);
  assertEquals(log.filter((l) => l.startsWith("name:")).length, 0);
});

Deno.test("nome compatível mas incompleto: entra o nome oficial", async () => {
  const { deps, log } = fakeDeps({
    contact: async () => ({ full_name: "Ana Exemplo Souza", cpf: "1", email: "ana@example.com", address_zip: "1", address_number: "1", address_street: "R" }),
    verifyCpf: async () => ({ status: 200, body: { ok: true, data: { full_name: "ANA EXEMPLO DA COSTA SOUZA" } } }),
  });
  await runSendContract(ARGS, deps);
  assertEquals(log[0], "name:Ana Exemplo da Costa Souza");
});

Deno.test("CPF já verificado: não consulta de novo", async () => {
  let consulted = false;
  const { deps } = fakeDeps({ cpfVerified: async () => true, verifyCpf: async () => { consulted = true; return { status: 200, body: {} }; } });
  const out = await runSendContract(ARGS, deps);
  assertEquals(consulted, false);
  assert(out.clientText);
});

Deno.test("contrato já enviado: manda o link de novo, sem gerar outro", async () => {
  const { deps, calls } = fakeDeps({ existingRequest: async () => ({ id: "req-0", status: "sent" }) });
  const out = await runSendContract(ARGS, deps);
  assertEquals(calls.map((c) => c.action), ["get_signing_link"]);
  assertEquals(calls[0].request_id, "req-0");
  assert(out.clientText?.includes("https://sign.example/s/abc"));
});

Deno.test("contrato já assinado: não gera outro", async () => {
  const { deps, calls } = fakeDeps({ existingRequest: async () => ({ id: "req-0", status: "completed" }) });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("já foi assinado"));
  assertEquals(calls.length, 0);
});

Deno.test("modelo pede um dado que falta: volta o que falta para o modelo", async () => {
  const { deps } = fakeDeps({
    callSignature: async () => ({ status: 422, body: { error: "unresolved_template_variables", message: "Preencha antes de enviar: Contrato: Data do fato gerador ({{data_fato_gerador}})" } }),
  });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("Data do fato gerador"));
  assertEquals(out.clientText, undefined);
});

Deno.test("sem responsável usável: passa para a equipe", async () => {
  const { deps, calls } = fakeDeps({ isUsableAuthor: async () => false });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.includes("sem responsável"));
  assertEquals(calls.length, 0);
});

Deno.test("modo de teste: simula, sem consultar CPF nem enviar", async () => {
  let consulted = false;
  const { deps, calls } = fakeDeps({ isTestMode: true, verifyCpf: async () => { consulted = true; return { status: 200, body: {} }; } });
  const out = await runSendContract(ARGS, deps);
  assert(out.modelMessage.startsWith("Modo de teste"));
  assertEquals(consulted, false);
  assertEquals(calls.length, 0);
});

Deno.test("dado do caso inválido: pede de novo", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runSendContract({ opportunity_fields: { fato_gerador: "adotei", data_fato_gerador: "ontem" } }, deps);
  assert(out.modelMessage.includes("Fato Gerador precisa ser um destes: Nascimento, Gestação"));
  assert(out.modelMessage.includes("Data do Fato Gerador precisa ser uma data"));
  assertEquals(calls.length, 0);
});

Deno.test("helpers: datas, nomes, configuração e resultado do CPF", () => {
  assertEquals(parseBrDate("15/07/2026"), "2026-07-15");
  assertEquals(parseBrDate("2026-07-15"), "2026-07-15");
  assertEquals(parseBrDate("31/02/2026"), null);
  assertEquals(parseBrDate("01.11.2026"), "2026-11-01");
  assertEquals(titleCaseName("ANA EXEMPLO DA COSTA SOUZA"), "Ana Exemplo da Costa Souza");
  assertEquals(parseContractSettings({}), null);
  assertEquals(parseContractSettings({ template_id: "t" })?.template_ids, ["t"]);
  assertEquals(cpfOutcome(200, { ok: false, error: "not_found" }, false).kind, "not_found");
  assertEquals(cpfOutcome(502, { ok: false, error: "timeout" }, false).kind, "unavailable");
  const { values } = opportunityFieldValues(DEFS, { fato_gerador: "Gestação", inexistente: "x" });
  assertEquals(values.map((v) => v.value), ["Gestação"]);
});
