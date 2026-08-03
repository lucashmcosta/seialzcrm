import { validateTwilioRequestSignature } from "../twilio-signature.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function twilioSignature(
  url: string,
  params: Record<string, string>,
  token: string,
) {
  const payload = url +
    Object.keys(params).sort().map((key) => key + params[key]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const value = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

Deno.test({
  name:
    "Twilio signature accepts the signed public request and rejects tampering",
  async fn() {
    const url =
      "https://voice.example.com/functions/v1/telephony-webhook/voice";
    const params = {
      CallSid: "CA123",
      From: "+5511999999999",
      To: "+551130000000",
    };
    const token = "test-auth-token";
    const signature = await twilioSignature(url, params, token);
    const req = new Request(url, {
      method: "POST",
      headers: { "x-twilio-signature": signature },
    });

    const valid = await validateTwilioRequestSignature({
      req,
      params,
      authToken: token,
      publicBaseUrl: "",
    });
    assertEquals(valid.valid, true);

    const tampered = await validateTwilioRequestSignature({
      req,
      params: { ...params, To: "+551130000001" },
      authToken: token,
      publicBaseUrl: "",
    });
    assertEquals(tampered.valid, false);
  },
});
