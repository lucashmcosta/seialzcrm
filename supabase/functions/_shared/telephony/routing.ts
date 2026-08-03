const TERMINAL = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

const STATUS_RANK: Record<string, number> = {
  queued: 0,
  initiated: 1,
  ringing: 2,
  answered: 3,
  "in-progress": 3,
  busy: 4,
  "no-answer": 4,
  failed: 4,
  canceled: 4,
  completed: 5,
};

export function telephonyAttemptLimit(
  numberType: string,
  configured: number | null | undefined,
): number {
  if (numberType === "user") return 1;
  const normalized = Number.isFinite(configured) ? Number(configured) : 3;
  return Math.max(1, Math.min(3, Math.trunc(normalized)));
}

export function isTerminalCallStatus(
  status: string | null | undefined,
): boolean {
  return !!status && TERMINAL.has(status);
}

export function canApplyCallStatus(
  current: string | null | undefined,
  incoming: string,
): boolean {
  if (!current) return true;
  if (current === incoming) return true;
  if (current === "completed") return false;
  if (isTerminalCallStatus(current)) return incoming === "completed";
  return (STATUS_RANK[incoming] ?? 0) >= (STATUS_RANK[current] ?? 0);
}
