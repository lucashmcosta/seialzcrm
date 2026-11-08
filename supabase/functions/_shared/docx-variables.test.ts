import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDocxVariables, type CustomDef } from "./docx-variables.ts";

const defs: CustomDef[] = [
  { id: "f1", name: "estado_civil", field_type: "text", options: null, module: "contacts" },
  { id: "f2", name: "fato_gerador", field_type: "select", module: "opportunities", options: { options: [
    { label: "Nascimento", value: "Nascimento", contract_text: "parto, inclusive de natimorto" },
    { label: "Gestação", value: "Gestação" },
  ] } },
  { id: "f3", name: "data_fato_gerador", field_type: "date", options: null, module: "opportunities" },
];
const contact = {
  full_name: "Maria Aparecida", cpf: "12345678909", rg: "123", rg_issuer: "SSP/SP", address_street: "Rua A", address_number: "10",
  address_complement: "", address_neighborhood: "Centro", address_city: "Campinas", address_state: "SP", address_zip: "13010000",
  phone: "+5519999990000", email: "maria@x.com",
};
const ctx = (vals: Record<string, unknown>) => ({ contact, birthDate: "1994-03-12", customDefs: defs, customValues: new Map(Object.entries(vals)), now: new Date("2026-11-08T12:00:00Z") });

Deno.test("contrato da Auxilius: tudo ligado automaticamente", () => {
  const r = resolveDocxVariables([
    "contratante_nome", "contratante_data_nascimento", "contratante_cpf", "contratante_rg", "contratante_rg_orgao", "contratante_estado_civil",
    "contratante_logradouro", "contratante_numero", "contratante_complemento", "contratante_bairro", "contratante_cidade", "contratante_uf",
    "contratante_cep", "contratante_celular", "contratante_email", "fato_gerador", "data_fato_gerador",
  ], ctx({ f1: "casada", f2: "Nascimento", f3: "2026-09-15" }));
  assertEquals(r.missing, []);
  assertEquals(r.values.contratante_cpf, "123.456.789-09");
  assertEquals(r.values.contratante_data_nascimento, "12/03/1994");
  assertEquals(r.values.contratante_estado_civil, "casada");
  assertEquals(r.values.contratante_cep, "13010-000");
  assertEquals(r.values.contratante_celular, "(19) 99999-0000");
  assertEquals(r.values.fato_gerador, "parto, inclusive de natimorto");
  assertEquals(r.values.data_fato_gerador, "15/09/2026");
  assertEquals(r.values.contratante_complemento, "");
});

Deno.test("opção sem texto no contrato usa o rótulo; faltando dado bloqueia", () => {
  const r = resolveDocxVariables(["fato_gerador", "data_fato_gerador", "responsavel_nome", "contratante_complemento"], ctx({ f2: "Gestação" }));
  assertEquals(r.values.fato_gerador, "Gestação");
  assertEquals(r.missing, ["data_fato_gerador", "responsavel_nome"]);
});
