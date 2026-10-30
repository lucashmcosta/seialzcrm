import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildComponents } from "./components.ts";
import { buildAuthPayload, validateAuthInput } from "./auth.ts";

// Snapshots do comportamento anterior à mudança (UTILITY/MARKETING).
const fullInput = {
  organizationId: "org",
  name: "aviso",
  language: "pt_BR",
  body: "Olá {{1}}, seu pedido {{2}} saiu.",
  header: "  Pedido  ",
  footer: " Obrigado ",
  variables: [{ key: "1", name: "nome", example: "Ana" }],
  buttons: [{ id: "a", title: " Sim " }, { id: "b", title: "" }],
};
const expectedFull = [
  { type: "HEADER", format: "TEXT", text: "Pedido" },
  { type: "BODY", text: "Olá {{1}}, seu pedido {{2}} saiu.", example: { body_text: [["Ana", "exemplo2"]] } },
  { type: "FOOTER", text: "Obrigado" },
  { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sim" }] },
];

for (const category of ["UTILITY", "MARKETING"]) {
  Deno.test(`${category}: payload completo idêntico ao anterior`, () => {
    assertEquals(buildComponents({ ...fullInput, category }), expectedFull);
  });
  Deno.test(`${category}: corpo simples idêntico ao anterior`, () => {
    assertEquals(
      buildComponents({ organizationId: "o", name: "n", language: "pt_BR", category, body: "Oi" }),
      [{ type: "BODY", text: "Oi" }],
    );
  });
}

Deno.test("AUTHENTICATION: payload exato", () => {
  const v = validateAuthInput({
    organizationId: "o", name: "codigo_login", language: "pt_BR",
    authentication: { add_security_recommendation: true, code_expiration_minutes: 5, button_text: "Copiar código" },
  });
  if (!v.ok) throw new Error("deveria validar");
  assertEquals(buildAuthPayload(v.name, v.language, v.options), {
    name: "codigo_login",
    language: "pt_BR",
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 5 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
    ],
  });
});

Deno.test("AUTHENTICATION: recusa limites", () => {
  const base = { organizationId: "o", name: "x", language: "pt_BR" };
  assertEquals(validateAuthInput({ ...base, authentication: { code_expiration_minutes: 0 } }).ok, false);
  assertEquals(validateAuthInput({ ...base, authentication: { code_expiration_minutes: 91 } }).ok, false);
  assertEquals(validateAuthInput({ ...base, authentication: { button_text: "x".repeat(26) } }).ok, false);
  assertEquals(validateAuthInput({ ...base, authentication: { add_security_recommendation: "sim" } }).ok, false);
  assertEquals(validateAuthInput(base).ok, true);
});
