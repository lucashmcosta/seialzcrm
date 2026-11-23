import { assertEquals, assert } from "jsr:@std/assert";
import { matchMaritalStatus, registrationFields, registrationReply } from "../supabase/functions/_shared/intelligence/contact-registration.ts";

const vazio = { cpf: null, email: null, address_zip: null, address_number: null, address_street: null };
const CPF_OK = "529.982.247-25";

Deno.test("dados do contrato: válidos viram campos do contato, endereço vem do CEP", () => {
  const { fields, problems } = registrationFields(
    { cpf: CPF_OK, email: " Maria@Gmail.com ", cep: "01310-100", address_number: "120", address_complement: "ap 3" },
    { street: "Avenida Paulista", neighborhood: "Bela Vista", city: "São Paulo", state: "sp" },
  );
  assertEquals(problems, []);
  assertEquals(fields, {
    cpf: "52998224725", email: "maria@gmail.com", address_zip: "01310100",
    address_street: "Avenida Paulista", address_neighborhood: "Bela Vista", address_city: "São Paulo", address_state: "SP",
    address_country_code: "BR", address_number: "120", address_complement: "ap 3",
  });
});

Deno.test("dados do contrato: inválido volta como problema e não grava", () => {
  const { fields, problems } = registrationFields({ cpf: "111.111.111-11", email: "maria@gmail", cep: "0131" }, null);
  assertEquals(fields, {});
  assertEquals(problems.length, 3);
  const nf = registrationFields({ cep: "99999999" }, "not_found");
  assertEquals(nf.fields, {});
  assert(nf.problems[0].includes("CEP não existe"));
});

Deno.test("dados do contrato: CEP geral sem rua usa a rua que a cliente escreveu; CEP com rua prevalece", () => {
  const geral = registrationFields({ cep: "45990000", address_street: "Rua das Flores", address_number: "10" }, { city: "Teixeira de Freitas", state: "BA" });
  assertEquals(geral.fields.address_street, "Rua das Flores");
  const comRua = registrationFields({ cep: "01310100", address_street: "Rua errada" }, { street: "Avenida Paulista" });
  assertEquals(comRua.fields.address_street, "Avenida Paulista");
});

Deno.test("dados do contrato: resposta diz o que falta, sem CPF na conversa", () => {
  const r = registrationReply({ cpf: "52998224725" }, [], { ...vazio, cpf: "52998224725" }, true);
  assert(r.includes("Ainda falta: e-mail, CEP, número da casa ou do prédio"));
  assert(!r.includes("52998224725"));
  const semRua = registrationReply({}, [], { cpf: "x", email: "y", address_zip: "45990000", address_number: "10", address_street: null }, true);
  assert(semRua.includes("nome da rua"));
  const ok = registrationReply({ email: "a@b.com" }, [], { cpf: "x", email: "a@b.com", address_zip: "1", address_number: "2", address_street: "R" }, true);
  assert(ok.includes("completo"));
});

const MARITAL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)"];

Deno.test("estado civil: o que a cliente escreve vira uma opção do campo", () => {
  assertEquals(matchMaritalStatus("solteira", MARITAL), "Solteiro(a)");
  assertEquals(matchMaritalStatus("Sou casada", MARITAL), "Casado(a)");
  assertEquals(matchMaritalStatus("divorciada", MARITAL), "Divorciado(a)");
  assertEquals(matchMaritalStatus("viúva", MARITAL), "Viúvo(a)");
  assertEquals(matchMaritalStatus("VIUVA", MARITAL), "Viúvo(a)");
});

Deno.test("estado civil: sem opção clara não grava (o agente pergunta de novo)", () => {
  assertEquals(matchMaritalStatus("união estável", MARITAL), null);
  assertEquals(matchMaritalStatus("", MARITAL), null);
  assertEquals(matchMaritalStatus("casada mas divorciando", MARITAL), null);
});

Deno.test("estado civil: campo sem opções grava o texto como veio", () => {
  assertEquals(matchMaritalStatus("Solteira", []), "Solteira");
});

Deno.test("estado civil entra no que falta só quando a org tem o campo", () => {
  const base = { cpf: "1", email: "a@b.co", address_zip: "1", address_number: "1", address_street: "Rua" };
  assert(!registrationReply({}, [], base, true).includes("estado civil"));
  assert(registrationReply({}, [], { ...base, marital_status: null }, true).includes("Ainda falta: estado civil"));
  assert(registrationReply({}, [], { ...base, marital_status: "Casado(a)" }, true).includes("completo"));
});
