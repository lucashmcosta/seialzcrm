import { escapeXml, normalizeE164BR, TwilioVoiceAdapter } from "./twilio.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("normalizeE164BR accepts local and canonical numbers", () => {
  assertEquals(normalizeE164BR("(11) 99999-9999"), "+5511999999999");
  assertEquals(normalizeE164BR("5511999999999"), "+5511999999999");
  assertEquals(normalizeE164BR("+14155552671"), "+14155552671");
});

Deno.test("Twilio adapter owns connection, status and recording normalization", () => {
  const adapter = new TwilioVoiceAdapter(null);
  const params = adapter.connectionParams({
    to: "+5511999999999",
    callId: "call-1",
    phoneNumberId: "number-1",
  });
  assertEquals(params.CallId, "call-1");
  assertEquals(adapter.normalizeStatus("RINGING"), "ringing");
  assertEquals(
    adapter.recordingMediaUrl("https://api.twilio.test/recording"),
    "https://api.twilio.test/recording.mp3",
  );
});

Deno.test("escapeXml protects TwiML attributes and content", () => {
  assertEquals(escapeXml(`A&B <\"x\">`), "A&amp;B &lt;&quot;x&quot;&gt;");
});
