import {
  closeTransferLegs,
  isTransferGenerationCurrent,
  type TransferVoiceCall,
} from "../../../../src/contexts/outbound-call/transferLegCoordinator.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

class FakeCall implements TransferVoiceCall {
  private state = "open";
  private listeners = new Set<() => void>();

  constructor(private readonly closeDelayMs: number | null) {}

  status() {
    return this.state;
  }

  disconnect() {
    if (this.closeDelayMs === null) return;
    setTimeout(() => {
      this.state = "closed";
      for (const listener of this.listeners) listener();
      this.listeners.clear();
    }, this.closeDelayMs);
  }

  once(_event: "disconnect", listener: () => void) {
    this.listeners.add(listener);
  }

  removeListener(_event: "disconnect", listener: () => void) {
    this.listeners.delete(listener);
  }
}

Deno.test("waits for the previous provider leg instead of using a fixed sleep", async () => {
  for (const delay of [1, 15, 50]) {
    const call = new FakeCall(delay);
    await closeTransferLegs({ calls: [call] }, [call], 100);
    assert(
      call.status() === "closed",
      `leg with ${delay}ms delay remained open`,
    );
  }
});

Deno.test("refuses to connect while a previous leg remains active", async () => {
  const call = new FakeCall(null);
  let rejected = false;
  try {
    await closeTransferLegs({ calls: [call] }, [call], 5);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message === "previous_voice_leg_still_active";
  }
  assert(rejected, "an active provider leg should block the replacement call");
});

Deno.test("stale browser listeners cannot control a new consultation", () => {
  assert(
    isTransferGenerationCurrent(
      {
        id: "transfer-a",
        consultationSequence: 2,
      },
      "transfer-a",
      2,
    ),
    "current generation should be accepted",
  );
  assert(
    !isTransferGenerationCurrent(
      {
        id: "transfer-b",
        consultationSequence: 1,
      },
      "transfer-a",
      1,
    ),
    "previous transfer should be rejected",
  );
  assert(
    !isTransferGenerationCurrent(
      {
        id: "transfer-a",
        consultationSequence: 2,
      },
      "transfer-a",
      1,
    ),
    "previous consultation cycle should be rejected",
  );
});
