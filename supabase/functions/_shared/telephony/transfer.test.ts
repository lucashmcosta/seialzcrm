import {
  isTerminalTransferState,
  transferBridgeOutcome,
  transferOwnsOriginalDial,
} from "./transfer.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("private transfer only becomes completed when target bridges", () => {
  assertEquals(transferBridgeOutcome("target", false), {
    state: "completed",
    result: "transferred",
  });
  assertEquals(transferBridgeOutcome("initiator", false), {
    state: "with_customer",
    result: null,
  });
  assertEquals(transferBridgeOutcome("initiator", true), {
    state: "canceled",
    result: "canceled_by_initiator",
  });
});

Deno.test("active transfer suppresses the original Dial terminal path", () => {
  for (
    const state of [
      "parking_customer",
      "customer_queued",
      "consult_ringing",
      "consulting",
      "returning_to_customer",
      "with_customer",
      "handoff_pending",
    ]
  ) assertEquals(transferOwnsOriginalDial(state), true);
  for (const state of ["completed", "canceled", "failed", null]) {
    assertEquals(transferOwnsOriginalDial(state), false);
  }
});

Deno.test("terminal transfer states are explicit", () => {
  assertEquals(isTerminalTransferState("completed"), true);
  assertEquals(isTerminalTransferState("canceled"), true);
  assertEquals(isTerminalTransferState("failed"), true);
  assertEquals(isTerminalTransferState("consulting"), false);
});
