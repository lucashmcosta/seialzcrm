import { assertEquals } from "jsr:@std/assert@1";
import { hmacSha256Hex } from "../_shared/client-portal/hmac.ts";
import { buildPayload, isRateLimited, peekOrgId, secretNameForOrg, validateInput, verifySignature } from "./logic.ts";

const AUX = "4bba3f19-b17e-4205-b495-68e62f62f41b";
const body = JSON.stringify({ organization_id: AUX, phone_e164: "+5511999998888", code: "1234", template: "codigo_acesso", language: "pt_BR" });

Deno.test("assinatura: válida, errada e fora de 5 min", async () => {
  const now = 1_800_000_000;
  const sig = "sha256=" + await hmacSha256Hex("s3", `${now}.${body}`);
  const v = (secret: string, ts: number, s: string) =>
    verifySignature({ secret, timestampHeader: String(ts), signatureHeader: s, rawBody: body, nowSeconds: now });
  assertEquals(await v("s3", now, sig), true);
  assertEquals(await v("outro", now, sig), false);
  assertEquals(await verifySignature({ secret: "s3", timestampHeader: String(now), signatureHeader: sig, rawBody: body, nowSeconds: now + 301 }), false);
});

Deno.test("segredo por org: só orgs do mapa", () => {
  assertEquals(secretNameForOrg(peekOrgId(body)), "AUXILIUS_OTP_HMAC_SECRET");
  assertEquals(secretNameForOrg("40ae935c-a7f7-4ad7-8ea4-91be6404a95f"), null);
  assertEquals(secretNameForOrg(peekOrgId("{lixo")), null);
});

Deno.test("validação de entrada", () => {
  assertEquals(validateInput(JSON.parse(body))?.phoneDigits, "5511999998888");
  assertEquals(validateInput({ ...JSON.parse(body), phone_e164: "11999998888" }), null);
  assertEquals(validateInput({ ...JSON.parse(body), code: "12" }), null);
});

Deno.test("payload leva o código no corpo e no botão url index 0", () => {
  const p = buildPayload({ to: "5511999998888", template: "codigo_acesso", language: "pt_BR", code: "1234" }) as any;
  const [b, btn] = p.template.components;
  assertEquals(b.parameters[0].text, "1234");
  assertEquals([btn.type, btn.sub_type, btn.index, btn.parameters[0].text], ["button", "url", "0", "1234"]);
});

Deno.test("limite: 5 por hora", () => {
  assertEquals(isRateLimited(4), false);
  assertEquals(isRateLimited(5), true);
});
