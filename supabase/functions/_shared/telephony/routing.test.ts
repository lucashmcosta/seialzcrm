import { canApplyCallStatus, telephonyAttemptLimit } from "./routing.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("individual numbers never overflow to a second user", () => {
  assertEquals(telephonyAttemptLimit("user", 3), 1);
});

Deno.test("company routing is capped at three attempts", () => {
  assertEquals(telephonyAttemptLimit("company", 10), 3);
  assertEquals(telephonyAttemptLimit("company", 2), 2);
});

Deno.test("late non-terminal callbacks cannot downgrade completed calls", () => {
  assertEquals(canApplyCallStatus("completed", "ringing"), false);
  assertEquals(canApplyCallStatus("completed", "completed"), true);
  assertEquals(canApplyCallStatus("ringing", "in-progress"), true);
  assertEquals(canApplyCallStatus("completed", "no-answer"), false);
  assertEquals(canApplyCallStatus("no-answer", "completed"), true);
  assertEquals(canApplyCallStatus("in-progress", "ringing"), false);
});
