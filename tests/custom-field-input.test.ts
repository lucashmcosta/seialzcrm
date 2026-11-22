import { assertEquals, assert } from "jsr:@std/assert";
import { coerceCustomFieldValue, parseCustomFieldInput, parseDateInput, parseMarketingConsent, type CustomFieldDefinition } from "../supabase/functions/_shared/custom-field-input.ts";

const opts = (...v: string[]) => ({ options: v.map((x) => ({ label: x, value: x })) });
const defs: CustomFieldDefinition[] = [
  { id: "1", name: "nota", field_type: "select", options: opts("A", "B", "C") },
  { id: "2", name: "forca_perfil", field_type: "select", options: opts("Forte", "Médio", "Fraco") },
  { id: "3", name: "validade", field_type: "date" },
  { id: "4", name: "linkedin", field_type: "text" },
  { id: "5", name: "interesses", field_type: "multiselect", options: opts("L-1", "O-1", "EB-1A") },
  { id: "6", name: "pontos", field_type: "number" },
];

Deno.test("seleção aceita a opção sem diferenciar maiúscula e acento, e grava o valor da opção", () => {
  assertEquals(coerceCustomFieldValue(defs[0], "b"), { ok: true, value: "B" });
  assertEquals(coerceCustomFieldValue(defs[1], "medio"), { ok: true, value: "Médio" });
});

Deno.test("valor fora das opções é recusado sem derrubar os outros", () => {
  const r = parseCustomFieldInput({ nota: "Z", linkedin: " linkedin.com/in/x ", nao_existe: "1" }, defs);
  assertEquals(r.values.map((v) => [v.definition.name, v.value]), [["linkedin", "linkedin.com/in/x"]]);
  assertEquals(r.rejected.map((x) => x.field).sort(), ["nao_existe", "nota"]);
});

Deno.test("datas: AAAA-MM-DD e DD/MM/AAAA; data que não existe é recusada", () => {
  assertEquals(parseDateInput("2026-12-05"), "2026-12-05");
  assertEquals(parseDateInput("5/12/2026"), "2026-12-05");
  assertEquals(parseDateInput("31/02/2026"), null);
  assertEquals(parseDateInput("amanhã"), null);
});

Deno.test("múltipla escolha aceita lista ou texto separado por vírgula, sem repetir", () => {
  assertEquals(coerceCustomFieldValue(defs[4], "l-1, O-1, L-1"), { ok: true, value: ["L-1", "O-1"] });
  assertEquals(coerceCustomFieldValue(defs[4], ["EB-1A"]), { ok: true, value: ["EB-1A"] });
  assert(!coerceCustomFieldValue(defs[4], "L-1, H-1B").ok);
});

Deno.test("número aceita vírgula decimal; vazio e nulo são ignorados", () => {
  assertEquals(coerceCustomFieldValue(defs[5], "11,5"), { ok: true, value: 11.5 });
  assertEquals(parseCustomFieldInput({ nota: null, linkedin: "" }, defs), { values: [], rejected: [] });
});

Deno.test("aceite de marketing: sim/não, booleano, ou por canal; resto é ignorado", () => {
  assertEquals(parseMarketingConsent("Sim"), [{ channel: "all", granted: true }]);
  assertEquals(parseMarketingConsent(false), [{ channel: "all", granted: false }]);
  assertEquals(parseMarketingConsent("Não"), [{ channel: "all", granted: false }]);
  assertEquals(parseMarketingConsent({ whatsapp: true, email: "no" }), [{ channel: "whatsapp", granted: true }, { channel: "email", granted: false }]);
  assertEquals(parseMarketingConsent("talvez"), null);
  assertEquals(parseMarketingConsent({ fax: true }), null);
});
