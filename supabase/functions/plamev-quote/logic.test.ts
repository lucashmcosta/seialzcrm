// deno test supabase/functions/plamev-quote/logic.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as L from "./logic.ts";

const SP = "03831D10-032A-4E64-8FD1-3CD4BE93D2C6";
const COB = "FFC9AA2F-25D7-343C-1317-2004C5E25D6A";
const CIDADE = "00EE048D-870B-49FF-9027-8EEFD72C46BB";
const recusa = (f: () => unknown) => assertThrows(f, L.Recusa) as L.Recusa;

const PET = { nome: "Rex", especie: "2", raca_id: "SEMRACA2", nascimento: "2022-03-10", cobertura_id: COB };
const PEDIDO = { estado_id: SP, forma_pagamento: 2, origem: "SITE", pets: [PET] };

Deno.test("listas da Plamev vêm como objeto numerado", () => {
  const raw = { "1": { Id: SP, Nome: "São Paulo", UF: "SP", Ativo: true }, "2": { Id: "x", Nome: "Acre", UF: "AC", Ativo: true } };
  assertEquals(L.estados(raw).map((e) => e.uf), ["AC", "SP"]);
  assertEquals(L.lista(null), []);
});

Deno.test("planos: preço a partir de no boleto e no cartão, só ativos", () => {
  const raw = {
    Coberturas: [
      {
        Id: COB, Nome: "ADVANCE PLUS (PADRÃO)", Ativo: "1", TiposCoberturasId: "14", TiposCoberturasNome: "Advance Plus",
        Especie: "TODOS", OrigemCheckout: "SITE", MaisVendido: "0", Reembolso: "1", Coparticipativo: "0",
        Valores: [{ PlanosFidelidade: "12", CoberturasQuantidadeProcedimentos: "145" }],
        Boleto: { Composicao: { ValorTotalMensalidade: 179.99 } },
        Cartao: { Composicao: { ValorTotalMensalidade: 169.99 } },
      },
      { Id: "inativo", Nome: "X", Ativo: "0", Valores: [] },
    ],
  };
  const [p, ...resto] = L.planos(raw);
  assertEquals(resto.length, 0);
  assertEquals([p.tipoId, p.boleto, p.cartao, p.fidelidadeMeses, p.procedimentos, p.reembolso], ["14", 179.99, 169.99, 12, 145, true]);
});

Deno.test("simulação: monta corpo da Plamev com campanha e cupom em cada pet", () => {
  const camp = { id: "A143B7CC-99FC-3B72-0C96-453769354D85", tabela_id: "51924481-9ABC-4F04-B72F-14218E65FFDE" };
  const corpo = L.corpoSimulacao(L.pedidoSimulacao({ ...PEDIDO, campanha: camp, cupom: " PET10 " }), "CONS-1");
  assertEquals(corpo.NovaCampanha, 1);
  assertEquals(corpo.ConsultoresId, "CONS-1");
  assertEquals(corpo.CotacoesPets[0], {
    Nome: "Rex", Especie: "2", RacasId: "SEMRACA2", DataNascimento: "2022-03-10", CoberturasId: COB,
    CupomDesconto: "PET10", CampanhasCoberturasId: camp.id, CampanhasCoberturasTabelasId: camp.tabela_id,
  });
  const sem = L.corpoSimulacao(L.pedidoSimulacao(PEDIDO), null);
  assertEquals("NovaCampanha" in sem || "ConsultoresId" in sem, false);
});

Deno.test("simulação: recusa entrada inválida", () => {
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, forma_pagamento: 3 })).codigo, "invalid_forma_pagamento");
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, pets: [] })).codigo, "invalid_pets");
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, pets: [{ ...PET, especie: "3" }] })).codigo, "invalid_especie");
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, pets: [{ ...PET, raca_id: "x' OR 1" }] })).codigo, "invalid_raca_id");
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, pets: [{ ...PET, nascimento: "2999-01-01" }] })).codigo, "invalid_nascimento");
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, campanha: { id: "x" } })).codigo, "invalid_campanha_id");
});

const CLIENTE = {
  nome: "Ana", cpf: "529.982.247-25", email: "ana@ex.com", telefone: "+55 (11) 98765-4321", cep: "01310-100",
  logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade_id: CIDADE,
};

Deno.test("cotação: separa DDD, limpa CEP, telefone com +55 e CPF; manda Sexo e Documento", () => {
  const c = L.cliente({ cliente: CLIENTE });
  assertEquals([c.ddd, c.telefone, c.cep, c.documento], ["11", "987654321", "01310100", "52998224725"]);
  const corpo = L.corpoCotacao(L.pedidoSimulacao({ ...PEDIDO, pets: [{ ...PET, sexo: "F" }] }), c, null);
  assertEquals([corpo.Site, corpo.CotacoesOrigensId, corpo.CidadesId, corpo.Complemento, corpo.Documento], [1, 2, CIDADE, undefined, "52998224725"]);
  assertEquals(corpo.CotacoesPets[0].Sexo, "F");
  assertEquals(recusa(() => L.cliente({ cliente: { ...CLIENTE, telefone: "1234" } })).codigo, "invalid_telefone");
  assertEquals(recusa(() => L.cliente({ cliente: { ...CLIENTE, cpf: "529.982.247-24" } })).codigo, "invalid_cpf");
  assertEquals(recusa(() => L.cliente({ cliente: { ...CLIENTE, cpf: "111.111.111-11" } })).codigo, "invalid_cpf");
});

Deno.test("sexo: opcional na simulação, obrigatório para gravar a cotação", () => {
  assertEquals("Sexo" in L.corpoSimulacao(L.pedidoSimulacao(PEDIDO), null).CotacoesPets[0], false);
  assertEquals(recusa(() => L.pedidoSimulacao({ ...PEDIDO, pets: [{ ...PET, sexo: "X" }] })).codigo, "invalid_sexo");
  assertEquals(recusa(() => L.corpoCotacao(L.pedidoSimulacao(PEDIDO), L.cliente({ cliente: CLIENTE }), null)).codigo, "missing_sexo");
});

Deno.test("resultado: arredonda e tira linhas zeradas", () => {
  const r = L.resultado({
    ValorAdesao: 84.978001, ValorMensalidade: 179.99, ValorTotalMensalidade: 169.99, ValorDescontosMensalidades: -10,
    DataFidelidade: "2027-11-02",
    ComposicaoMensalidade: [
      { Nome: "Mensalidade Plano ADVANCE PLUS Pet Rex", Valor: "179.99" },
      { Nome: "Desconto recorrente pagamento cartão de crédito Pet (Rex)", Valor: -10 },
      { Nome: "Desconto 1° Pet (Rex)", Valor: 0 },
    ],
  });
  assertEquals(r.adesao, 84.98);
  assertEquals(r.composicaoMensalidade.length, 2);
  assertEquals("numeroCotacao" in r, false);
  assertEquals(L.resultado({ NumeroCotacao: 123, Id: "abc" }).numeroCotacao, "123");
});

Deno.test("link de pagamento = checkout da Plamev com o Id da cotação em base64", () => {
  // Link real gerado pela cotação 202611000000020-01.
  const r = L.resultado({ NumeroCotacao: "202611000000020-01", Id: "76812963-47a8-6698-b73f-ec791792b205" });
  assertEquals(r.linkPagamento, "https://cliente.plamev.com.br/pagamento/checkout/NzY4MTI5NjMtNDdBOC02Njk4LUI3M0YtRUM3OTE3OTJCMjA1/");
  assertEquals(L.resultado({ NumeroCotacao: "1", Id: "" }).linkPagamento, null);
});

Deno.test("contato do Seialz vira dados do cliente (telefone sem +55, CEP e CPF só números)", () => {
  const c = L.clienteDoContato({
    full_name: " Lucas Costa ", phone: "+5511910307707", email: "l@ex.com", cpf: "529.982.247-25",
    address_zip: "01310-100", address_street: "Av. Paulista", address_number: "1000", address_complement: null,
    address_neighborhood: "Bela Vista", address_city: "São Paulo", address_state: "SP",
  });
  assertEquals(c, {
    nome: "Lucas Costa", cpf: "52998224725", email: "l@ex.com", telefone: "11910307707", cep: "01310100",
    logradouro: "Av. Paulista", numero: "1000", complemento: "", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP",
  });
  assertEquals(L.clienteDoContato({ first_name: "Ana", last_name: "Lima" }).nome, "Ana Lima");
});

Deno.test("nota da cotação na linha do tempo leva número, valores e link", () => {
  const r = L.resultado({
    NumeroCotacao: "202611000000020-01", Id: "76812963-47A8-6698-B73F-EC791792B205",
    ValorTotalMensalidade: 139.99, ValorAdesao: 89.99,
  });
  const n = L.notaCotacao(r, [{ nome: "Max", plano: "Advance" }], 2);
  assertEquals(n.title, "Cotação Plamev nº 202611000000020-01");
  assertEquals(n.body.split("\n"), [
    "Max: plano Advance",
    "Mensalidade R$ 139,99 · adesão R$ 89,99 · cartão",
    "Link de pagamento: https://cliente.plamev.com.br/pagamento/checkout/NzY4MTI5NjMtNDdBOC02Njk4LUI3M0YtRUM3OTE3OTJCMjA1/",
  ]);
});

Deno.test("erro da Plamev não vaza o eco de cabeçalhos", () => {
  assertEquals(L.erroPlamev({ erro: "Cupom não validado.", mensagem: "Cupom não validado. Código da Mensagem: 611309538" }), "Cupom não validado.");
  assertEquals(L.erroPlamev({ erro: "Não Autorizado", argumento: { Descricao: { Authorization: "segredo" } } }), "Não Autorizado");
});

Deno.test("token colado: aceita com prefixo Authorization/Bearer, recusa curto ou com espaço", () => {
  const t = "a".repeat(850);
  assertEquals(L.tokenColado(`  ${t}\n`), t);
  assertEquals(L.tokenColado(`Authorization: Bearer ${t}`), t);
  assertEquals(recusa(() => L.tokenColado("curto")).codigo, "invalid_token");
  assertEquals(recusa(() => L.tokenColado(`${t} ${t}`)).codigo, "invalid_token");
  assertEquals(recusa(() => L.tokenColado(undefined)).codigo, "invalid_token");
});
