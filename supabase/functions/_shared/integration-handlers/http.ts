// Helper HTTP que classifica respostas em Success / Conflict / Retryable / Permanent.

import { Classification } from "./types.ts";

export interface ClassifiedResponse {
  classification: Classification;
  status: number;
  body: string;
  durationMs: number;
  error?: string;
}

export async function fetchWithClassification(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ClassifiedResponse> {
  const start = performance.now();
  const { timeoutMs = 20000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const body = await res.text();
    const durationMs = Math.round(performance.now() - start);

    let classification: Classification;
    if (res.status >= 200 && res.status < 300) {
      classification = Classification.Success;
    } else if (res.status === 409) {
      classification = Classification.Conflict;
    } else if (res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500) {
      classification = Classification.Retryable;
    } else {
      classification = Classification.Permanent;
    }

    return {
      classification,
      status: res.status,
      body,
      durationMs,
      error: classification === Classification.Success || classification === Classification.Conflict
        ? undefined
        : `HTTP ${res.status}: ${body.slice(0, 500)}`,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return {
      classification: Classification.Retryable,
      status: 0,
      body: "",
      durationMs,
      error: `Network error: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
