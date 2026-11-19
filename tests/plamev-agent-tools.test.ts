import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import * as R from "../supabase/functions/_shared/widgets/plamev-quote/regras.ts";
import {
  camposDoCadastro, type PlamevApi, respostaDoCadastro, rodarEnviarMaterial, rodarLerMateriais, rodarRede, rodarSimulacao, SIMULACAO_HEADER,
} from "../supabase/functions/_shared/widgets/plamev-quote/agent-tools.ts";
import { WIDGET_AGENT_TOOLS } from "../supabase/functions/_shared/widgets/agent-tools.ts";

const EST = "11111111-1111-1111-1111-111111111111";
const ADV = "22222222-2222-2222-2222-222222222222";
const SLIM = "33333333-3333-3333-3333-333333333333";
const CAT = "44444444-4444-4444-4444-444444444444";
const C79 = "55555555-5555-5555-5555-555555555555";
const C89 = "66666666-6666-6666-6666-666666666666";
const TAB = "77777777-7777-7777-7777-777777777777";

const clinica = (nome: string, distanciaKm: number): R.Credenciado => ({
  nome, endereco: "Rua A, 10", bairro: "Centro", cidade: "Salvador", estado: "Bahia", telefone: "(71) 999990000", distanciaKm, volante: false,
});

const cobertura = (Id: string, Nome: string, Tipo: string, Especie = "TODOS") => ({
  Id, Nome, TiposCoberturasId: Tipo, TiposCoberturasNome: Nome, Especie, OrigemCheckout: "SITE", Ativo: "1", Coparticipativo: "0",
  Valores: [{ PlanosFidelidade: "12" }], Boleto: { Composicao: { ValorTotalMensalidade: 159.99 } }, Cartao: { Composicao: { ValorTotalMensalidade: 149.99 } },
});

/** API falsa: guarda o que foi simulado e devolve o preço pela campanha e pela forma de pagamento. */
function apiFalsa(over: Partial<PlamevApi> = {}) {
  const simulados: any[] = [];
  const api: PlamevApi = {
    enderecoDoCep: async () => ({ uf: "BA", cidade: "Salvador" }),
    rede: async (_cep, raio) => (raio >= 5 ? [clinica("Vet Um", 0.4), clinica("Vet Dois", 1.2)] : []),
    plamev: async (path, init) => {
      if (path.startsWith("Estados/")) return [{ Id: EST, Nome: "Bahia", UF: "BA" }];
      if (path.startsWith("Coberturas/")) {
        return { Coberturas: { "1": cobertura(ADV, "Advance", "2"), "2": cobertura(SLIM, "Slim", "1"), "3": cobertura(CAT, "Platinum Cat Comfort", "3", "FELINO") } };
      }
      if (path.startsWith("Racas/")) return [{ Id: "10", Nome: "SRD (Sem Raça Definida)" }, { Id: "11", Nome: "Shih Tzu" }, { Id: "12", Nome: "Spitz Alemão (Lulu da Pomerânia)" }];
      if (path.startsWith("CampanhasCoberturas/")) return [{ CampanhasCoberturasId: C79, CampanhasCoberturasNome: "ADVANCE 79" }, { CampanhasCoberturasId: C89, CampanhasCoberturasNome: "ADVANCE 89" }];
      if (path.startsWith("CampanhasCoberturasTabelas/")) return [{ Id: TAB, Nome: "Padrão", Tipo: "1", Ativo: "1" }];
      if (path.startsWith("Cotacoes/SimulaCotacaoPet")) {
        const b = init!.body as any;
        simulados.push(b);
        const camp = b.CotacoesPets[0].CampanhasCoberturasId;
        const base = camp === C79 ? 79.98 : camp === C89 ? 89.99 : 149.99;
        const total = b.FormaPagamento === 1 ? base + 5.71 : base;
        return { ValorMensalidade: 149.99, ValorTotalMensalidade: total, ValorDescontosMensalidades: total - 149.99, ValorAdesao: total, DataFidelidade: "2027-11-18" };
      }
      throw new Error(`chamada não esperada: ${path}`);
    },
    ...over,
  };
  return { api, simulados };
}

const sid = { nome: "Sid", especie: "cao", raca: "shih tzu", idade_meses: 24 };

Deno.test("rede: manda as clínicas mais perto e não deixa o agente repetir endereços", async () => {
  const out = await rodarRede({ cep: "40231-305" }, apiFalsa().api);
  assert(out.clientText?.startsWith("Clínicas credenciadas Plamev perto do CEP 40231-305:"));
  assertStringIncludes(out.clientText!, "1. Vet Um (0,4 km)");
  assertStringIncludes(out.modelMessage, "Não repita nomes");
});

Deno.test("rede: sem clínica em 50 km, não manda lista e manda dizer a verdade", async () => {
  const raios: number[] = [];
  const out = await rodarRede({ cep: "63050730" }, apiFalsa({ rede: async (_c, r) => { raios.push(r); return []; } }).api);
  assertEquals(raios, [5, 20, 50]);
  assertEquals(out.clientText, undefined);
  assertStringIncludes(out.modelMessage, "Não há clínica credenciada");
});

Deno.test("rede: só achou longe, avisa a distância", async () => {
  const out = await rodarRede({ cep: "40231305" }, apiFalsa({ rede: async (_c, r) => (r >= 20 ? [clinica("Vet Longe", 14)] : []) }).api);
  assert(out.clientText);
  assertStringIncludes(out.modelMessage, "Não há credenciada a menos de 5 km");
});

Deno.test("rede: CEP incompleto pede o CEP", async () => {
  const out = await rodarRede({ cep: "4023" }, apiFalsa().api);
  assertStringIncludes(out.modelMessage, "CEP inválido");
});

Deno.test("simulação: faltando idade ou espécie, não chama a Plamev e diz o que perguntar", async () => {
  const { api, simulados } = apiFalsa();
  const out = await rodarSimulacao({ cep: "40231305", plano: "Advance", pets: [{ nome: "Sid" }] }, api, undefined, "2026-11-18", []);
  assertEquals(simulados.length, 0);
  assertEquals(out.clientText, undefined);
  assertStringIncludes(out.modelMessage, "se Sid é cachorro ou gato");
  assertStringIncludes(out.modelMessage, "a idade ou a data de nascimento de Sid");
});

Deno.test("simulação: sem configuração fica com a campanha mais barata e mostra cartão e boleto", async () => {
  const { api } = apiFalsa();
  const out = await rodarSimulacao({ cep: "40231305", plano: "advance", pets: [sid] }, api, undefined, "2026-11-18", []);
  assert(out.clientText?.startsWith(SIMULACAO_HEADER));
  assertStringIncludes(out.clientText!, "• Sid: plano Advance");
  assertStringIncludes(out.clientText!, "No cartão de crédito: R$ 79,98 por mês (de R$ 149,99)");
  assertStringIncludes(out.clientText!, "No boleto ou Pix: R$ 85,69 por mês");
  assertStringIncludes(out.clientText!, "Sem coparticipação");
  assertStringIncludes(out.teamNote!, "campanha: ADVANCE 79");
  assertStringIncludes(out.teamNote!, "nascimento 2024-11-18");
});

Deno.test("simulação: campanha configurada no agente vale mais que a mais barata", async () => {
  const { api, simulados } = apiFalsa();
  const out = await rodarSimulacao({ cep: "40231305", plano: "Advance", pets: [sid] }, api, { campanhas: { Advance: "advance 89" } }, "2026-11-18", []);
  assertStringIncludes(out.clientText!, "R$ 89,99 por mês");
  // Só a campanha escolhida é simulada: cartão e boleto.
  assertEquals(simulados.length, 2);
  assert(simulados.every((s) => s.CotacoesPets[0].CampanhasCoberturasId === C89 && s.NovaCampanha === 1));
});

Deno.test("simulação: política sem campanha usa o preço padrão", async () => {
  const { api, simulados } = apiFalsa();
  const out = await rodarSimulacao({ cep: "40231305", plano: "Advance", pets: [sid] }, api, { politica: "sem_campanha" }, "2026-11-18", []);
  assertStringIncludes(out.clientText!, "No cartão de crédito: R$ 149,99 por mês");
  assert(simulados.every((s) => !s.CotacoesPets[0].CampanhasCoberturasId));
});

Deno.test("simulação: a mesma já mandada não vai de novo", async () => {
  const { api } = apiFalsa();
  const args = { cep: "40231305", plano: "Advance", pets: [sid] };
  const primeira = await rodarSimulacao(args, api, undefined, "2026-11-18", []);
  const segunda = await rodarSimulacao(args, api, undefined, "2026-11-18", [{ role: "assistant", content: primeira.clientText! }]);
  assertEquals(segunda.clientText, undefined);
  assertStringIncludes(segunda.modelMessage, "já foi mandada");
});

Deno.test("simulação: plano que não existe para a espécie lista os que existem", async () => {
  const { api } = apiFalsa();
  const out = await rodarSimulacao({ cep: "40231305", plano: "Platinum Cat Comfort", pets: [sid] }, api, undefined, "2026-11-18", []);
  assertEquals(out.clientText, undefined);
  assertStringIncludes(out.modelMessage, "Planos disponíveis: Advance, Slim");
});

Deno.test("simulação: estado fora da Plamev não fala em valores", async () => {
  const { api } = apiFalsa({ enderecoDoCep: async () => ({ uf: "AC", cidade: "Rio Branco" }) });
  const out = await rodarSimulacao({ cep: "69900000", plano: "Advance", pets: [sid] }, api, undefined, "2026-11-18", []);
  assertStringIncludes(out.modelMessage, "não vende plano no estado");
});

Deno.test("raça: acha por nome parecido e cai em SRD quando não conhece", () => {
  const racas = [{ id: "10", nome: "SRD (Sem Raça Definida)" }, { id: "11", nome: "Shih Tzu" }, { id: "12", nome: "Spitz Alemão (Lulu da Pomerânia)" }];
  assertEquals(R.casarRaca(racas, "shihtzu")?.raca.id, "11");
  assertEquals(R.casarRaca(racas, "Lulu da pomerania")?.raca.id, "12");
  assertEquals(R.casarRaca(racas, "pé duro"), { raca: racas[0], exata: true });
  assertEquals(R.casarRaca(racas, "bulldog campeiro"), { raca: racas[0], exata: false });
});

Deno.test("plano: nome igual vale mais que nome parecido", () => {
  const p = (id: string, nome: string, origem = "SITE", especie = "TODOS") => ({ id, nome, tipoId: "1", especie, origem, coparticipativo: false, fidelidadeMeses: 12 });
  const planos = [p("a", "Slim Essencial"), p("b", "Slim", "LP"), p("c", "Slim"), p("d", "Advance Plus"), p("e", "Advance")];
  assertEquals(R.casarPlano(planos, "Slim", "2")?.id, "c");
  assertEquals(R.casarPlano(planos, "plano advance", "2")?.id, "e");
  assertEquals(R.casarPlano(planos, "essencial", "2")?.id, "a");
  assertEquals(R.casarPlano(planos, "diamond", "2"), null);
});

Deno.test("nascimento: usa a data informada ou conta a idade para trás", () => {
  assertEquals(R.nascimentoDoPet({ nascimento: "2019-12-16" }, "2026-11-18"), "2019-12-16");
  assertEquals(R.nascimentoDoPet({ idade_meses: 9 }, "2026-11-18"), "2026-02-18");
  assertEquals(R.nascimentoDoPet({ nascimento: "2033-01-01" }, "2026-11-18"), null);
  assertEquals(R.nascimentoDoPet({}, "2026-11-18"), null);
});

const materiais = [
  { id: "1", titulo: "Cobertura - Slim", tipo: "document" as const, conteudoMd: "Slim: consulta carência 30 dias", url: "https://x/1/Cobertura-Slim.pdf" },
  { id: "2", titulo: "Cobertura - Slim Essencial", tipo: "document" as const, conteudoMd: "Essencial: vacina", url: "https://x/2/Cobertura-Slim-Essencial.pdf" },
  { id: "3", titulo: "Resumo - Slim", tipo: "image" as const, conteudoMd: null, url: "https://x/3/Resumo-Slim.png" },
  { id: "4", titulo: "Comparativos 3 Planos", tipo: "image" as const, conteudoMd: "Slim x Advance x Platinum", url: "https://x/4/Comparativos-3-Planos.png" },
];

Deno.test("ler materiais: traz só o plano pedido, e o comparativo quando não há plano", () => {
  const slim = rodarLerMateriais({ plano: "Slim" }, materiais).modelMessage;
  assertStringIncludes(slim, "carência 30 dias");
  assert(!slim.includes("Essencial: vacina"));
  assertStringIncludes(rodarLerMateriais({}, materiais).modelMessage, "Slim x Advance x Platinum");
});

Deno.test("enviar material: manda o arquivo com o título de legenda, uma vez só", () => {
  const out = rodarEnviarMaterial({ titulo: "resumo slim" }, materiais, []);
  assertEquals(out.clientMedia, [{ url: "https://x/3/Resumo-Slim.png", type: "image", caption: "Resumo - Slim" }]);
  const de_novo = rodarEnviarMaterial({ titulo: "Resumo - Slim" }, materiais, [{ role: "assistant", content: "Resumo - Slim" }]);
  assertEquals(de_novo.clientMedia, undefined);
  const errado = rodarEnviarMaterial({ titulo: "tabela de preços" }, materiais, []);
  assertStringIncludes(errado.modelMessage, "- Comparativos 3 Planos (imagem)");
});

Deno.test("as ferramentas da Plamev entram no registro, presas ao widget", () => {
  const plamev = WIDGET_AGENT_TOOLS.filter((t) => t.widgetKey === "plamev_quote").map((t) => t.name);
  assertEquals(plamev, ["plamev_consultar_rede", "plamev_simular_plano", "plamev_ler_materiais", "plamev_enviar_material", "plamev_salvar_cadastro"]);
});

Deno.test("cadastro: grava só o que é válido e preenche o endereço pelo CEP", () => {
  const { campos, problemas } = camposDoCadastro(
    { cpf: "529.982.247-25", email: " Fulana@Gmail.com ", cep: "40231-305", numero: 81, complemento: "ap 2" },
    { uf: "BA", cidade: "Salvador", bairro: "Federação", logradouro: "Avenida Anita Garibaldi" },
  );
  assertEquals(problemas, []);
  assertEquals(campos, {
    cpf: "52998224725", email: "fulana@gmail.com", address_zip: "40231305", address_street: "Avenida Anita Garibaldi",
    address_neighborhood: "Federação", address_city: "Salvador", address_state: "BA", address_number: "81", address_complement: "ap 2",
  });
});

Deno.test("cadastro: CPF e e-mail errados não são gravados e voltam como problema", () => {
  const { campos, problemas } = camposDoCadastro({ cpf: "111.111.111-11", email: "fulana.gmail.com", cep: "4023" }, null);
  assertEquals(campos, {});
  assertEquals(problemas.length, 3);
});

Deno.test("cadastro: diz o que falta, e manda passar quando está completo", () => {
  const falta = respostaDoCadastro({ cpf: "52998224725" }, [], { cpf: "52998224725", email: null, address_zip: null, address_number: "" }, true);
  assertStringIncludes(falta, "Ainda falta: e-mail, CEP, número da casa ou apartamento");
  assertStringIncludes(falta, "não insista");
  const completo = respostaDoCadastro({ email: "a@b.com" }, [], { cpf: "52998224725", email: "a@b.com", address_zip: "40231305", address_number: "81" }, true);
  assertStringIncludes(completo, "O cadastro está completo");
  assertStringIncludes(completo, "Não repita o CPF");
  assertStringIncludes(respostaDoCadastro({ email: "a@b.com" }, [], { cpf: null, email: "a@b.com", address_zip: null, address_number: null }, false), "Modo de teste");
});
