export type TelephonyTransferState =
  | "parking_customer"
  | "customer_queued"
  | "consult_ringing"
  | "consulting"
  | "returning_to_customer"
  | "with_customer"
  | "handoff_pending"
  | "completed"
  | "canceled"
  | "failed";

export function isTerminalTransferState(state: string | null | undefined) {
  return state === "completed" || state === "canceled" || state === "failed";
}

export function transferOwnsOriginalDial(state: string | null | undefined) {
  return !!state && !isTerminalTransferState(state);
}

export function canApplyTransferEvent(input: {
  transferId: string;
  activeTransferId: string | null | undefined;
  currentCycle: number;
  eventCycle: number;
}) {
  return input.activeTransferId === input.transferId &&
    input.currentCycle === input.eventCycle;
}

export function transferBridgeOutcome(
  actor: "initiator" | "target",
  finish: boolean,
): {
  state: "completed" | "canceled" | "with_customer";
  result: string | null;
} {
  if (actor === "target") return { state: "completed", result: "transferred" };
  if (finish) return { state: "canceled", result: "canceled_by_initiator" };
  return { state: "with_customer", result: null };
}
