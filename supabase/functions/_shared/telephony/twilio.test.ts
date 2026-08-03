import {
  escapeXml,
  normalizeE164BR,
  TwilioVoiceAdapter,
  twilioVoiceIdentity,
} from "./twilio.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    throw error;
  }
  throw new Error("Expected function to throw");
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
  assertEquals(escapeXml(`A&B <"x">`), "A&amp;B &lt;&quot;x&quot;&gt;");
});

Deno.test("twilioVoiceIdentity removes UUID separators", () => {
  const identity = twilioVoiceIdentity(
    "dadc0d30-0afd-4446-a376-2d60fb4f6e32",
    "b246ef6f-6242-4011-a112-6d8783d2896a",
  );
  assertEquals(
    identity,
    "user_dadc0d300afd4446a3762d60fb4f6e32_org_b246ef6f62424011a1126d8783d2896a",
  );
  assertEquals(/^[A-Za-z0-9_]+$/.test(identity), true);
});

Deno.test("twilioVoiceIdentity rejects an empty component", () => {
  assertThrows(
    () => twilioVoiceIdentity("---", "b246ef6f-6242-4011-a112-6d8783d2896a"),
    "invalid_twilio_voice_identity",
  );
});

Deno.test("twilioVoiceIdentity rejects a missing runtime component", () => {
  assertThrows(
    () =>
      twilioVoiceIdentity(
        undefined as unknown as string,
        "b246ef6f-6242-4011-a112-6d8783d2896a",
      ),
    "invalid_twilio_voice_identity",
  );
});
