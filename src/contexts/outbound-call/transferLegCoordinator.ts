export interface TransferVoiceCall {
  status: () => string;
  disconnect: () => void;
  once: (event: 'disconnect', listener: () => void) => unknown;
  removeListener?: (event: 'disconnect', listener: () => void) => unknown;
}

export interface TransferVoiceDevice {
  calls: TransferVoiceCall[];
}

const CLOSED = 'closed';

function waitForDisconnect(call: TransferVoiceCall, timeoutMs: number) {
  if (call.status() === CLOSED) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      call.removeListener?.('disconnect', onDisconnect);
      resolve(closed);
    };
    const onDisconnect = () => finish(true);
    const timer = globalThis.setTimeout(() => finish(call.status() === CLOSED), timeoutMs);
    call.once('disconnect', onDisconnect);
  });
}

/**
 * Closes exactly the browser legs currently owned by the transfer. It never
 * calls Device.disconnectAll(), because that could terminate an unrelated
 * incoming call registered on the same Device.
 */
export async function closeTransferLegs(
  device: TransferVoiceDevice,
  knownCalls: Array<TransferVoiceCall | null | undefined>,
  timeoutMs = 4_500,
) {
  const calls = Array.from(new Set([
    ...knownCalls,
    ...device.calls,
  ].filter((call): call is TransferVoiceCall => !!call && call.status() !== CLOSED)));

  for (const call of calls) {
    try {
      call.disconnect();
    } catch {
      // The provider may already be closing the leg after a TwiML redirect.
    }
  }

  const results = await Promise.all(calls.map((call) => waitForDisconnect(call, timeoutMs)));
  const remaining = device.calls.filter((call) => call.status() !== CLOSED);
  if (results.some((closed) => !closed) || remaining.length > 0) {
    throw new Error('previous_voice_leg_still_active');
  }
}

export function isTransferGenerationCurrent(
  current: { id: string; consultationSequence: number } | null,
  expectedTransferId: string,
  expectedSequence: number,
) {
  return current?.id === expectedTransferId &&
    current.consultationSequence === expectedSequence;
}
