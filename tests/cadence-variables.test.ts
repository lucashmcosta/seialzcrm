import { assertEquals } from "jsr:@std/assert";
import { resolveCadenceVariables, type CadenceVariableContext } from "../supabase/functions/_shared/cadence-variables.ts";

const ctx: CadenceVariableContext = {
  contact: { full_name: "Maria Clara Souza", first_name: null, email: "m@x.com" },
  opportunity: { title: "Visto L-1", amount: 15000, currency: "BRL" },
  owner: { full_name: "João Pedro", first_name: null },
  org: { name: "Empresa X" },
  custom: { trilha: "L-1", validade_proposta: "2026-12-05", interesses: ["L-1", "O-1"] },
};

Deno.test("preenche marcadores do contato, responsável, org e campos customizados", () => {
  const r = resolveCadenceVariables({
    "1": "{{contact.first_name}}", "2": "{{owner.first_name}} da {{org.name}}",
    "3": "{{custom.trilha}}", "4": "até {{custom.validade_proposta}}", "5": "{{custom.interesses}}",
  }, ctx);
  assertEquals(r, { ok: true, values: { "1": "Maria", "2": "João da Empresa X", "3": "L-1", "4": "até 05/12/2026", "5": "L-1, O-1" } });
});

Deno.test("texto fixo passa como está; valor formatado em reais", () => {
  const r = resolveCadenceVariables({ "1": "Oi!", "2": "{{opportunity.amount}}" }, ctx);
  assertEquals(r.ok, true);
  if (r.ok) { assertEquals(r.values["1"], "Oi!"); assertEquals(r.values["2"].replace(/\s/g, " "), "R$ 15.000,00"); }
});

Deno.test("variável que fica vazia é apontada (não manda template incompleto)", () => {
  const r = resolveCadenceVariables({ "1": "{{contact.first_name}}", "2": "{{custom.nao_existe}}", "3": "{{owner.first_name}}" },
    { ...ctx, owner: null });
  assertEquals(r, { ok: false, missing: ["2", "3"] });
});
