// TEMPORARY: handler de teste para validação da Outbox. REMOVER após validação.
import { Classification, type Handler, type HandlerResult } from "./types.ts";

export const testOutboxHandler: Handler = (ctx): Promise<HandlerResult> => {
  const mode = (ctx.job.payload as { mode?: string })?.mode;
  if (mode === "success") {
    return Promise.resolve({ classification: Classification.Success, externalId: `test-${ctx.job.id}` });
  }
  if (mode === "retryable") {
    return Promise.resolve({ classification: Classification.Retryable, error: "simulated retryable" });
  }
  if (mode === "permanent") {
    return Promise.resolve({ classification: Classification.Permanent, error: "simulated permanent" });
  }
  return Promise.resolve({ classification: Classification.Permanent, error: `unknown test mode: ${mode}` });
};
