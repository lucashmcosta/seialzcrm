// Evolution API — Cliente HTTP reutilizável.
// Timeout explícito, retry limitado (apenas outbound), erros padronizados,
// logs com redação. Baseado nos contratos da Fase 0 (DISCOVERY.md).
//
// Fase 3: código pronto para uso, mas nenhum caller produtivo o invoca
// enquanto a feature flag `evolution_api_enabled` estiver desligada.

import {
  EvolutionConnectionStateResult,
  EvolutionCreateInstanceResult,
  EvolutionError,
  EvolutionInstanceSummary,
  EvolutionQrCode,
  EvolutionWebhookConfig,
} from "./types.ts";
import { logEvolution } from "./logger.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;

// Sanitiza subdomain conforme regra global do projeto:
// remove https://, whitespace, trailing slashes.
function sanitizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  const b = sanitizeBaseUrl(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export interface EvolutionEnv {
  baseUrl: string;
  apiKey: string;
}

export function readEvolutionEnv(): EvolutionEnv | EvolutionError {
  const baseUrl = Deno.env.get("EVOLUTION_BASE_URL");
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!baseUrl || !apiKey) {
    return {
      code: "MISSING_SECRET",
      status: 503,
      message:
        "EVOLUTION_BASE_URL and EVOLUTION_GLOBAL_API_KEY must be configured",
    };
  }
  return { baseUrl: sanitizeBaseUrl(baseUrl), apiKey };
}

interface EvolutionRequestOptions {
  env: EvolutionEnv;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  // apenas GET e webhook config aceitam retry — chamadas idempotentes
  retryable?: boolean;
  timeoutMs?: number;
  requestId?: string;
  op?: string;
}

interface EvolutionResponse<T> {
  ok: true;
  status: number;
  data: T;
}

interface EvolutionFailure {
  ok: false;
  error: EvolutionError;
}

type EvolutionResult<T> = EvolutionResponse<T> | EvolutionFailure;

async function doFetch<T>(
  opts: EvolutionRequestOptions,
): Promise<EvolutionResult<T>> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(joinUrl(opts.env.baseUrl, opts.path), {
      method: opts.method,
      headers: {
        "apikey": opts.env.apiKey,
        "content-type": "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (res.ok) {
      logEvolution("info", {
        fn: "evolution-instance-manager",
        op: opts.op,
        requestId: opts.requestId,
        status: res.status,
        durationMs,
      });
      return { ok: true, status: res.status, data: parsed as T };
    }

    const code = res.status >= 500 ? "UPSTREAM_5XX" : "UPSTREAM_4XX";
    logEvolution("warn", {
      fn: "evolution-instance-manager",
      op: opts.op,
      requestId: opts.requestId,
      status: res.status,
      durationMs,
      code,
      message: typeof parsed === "string" ? parsed : "upstream non-2xx",
    });
    return {
      ok: false,
      error: {
        code,
        status: res.status,
        message: `Evolution upstream returned ${res.status}`,
        details: parsed,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const code = isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
    logEvolution("error", {
      fn: "evolution-instance-manager",
      op: opts.op,
      requestId: opts.requestId,
      durationMs,
      code,
      message: (err as Error)?.message ?? "fetch error",
    });
    return {
      ok: false,
      error: {
        code,
        status: 504,
        message: isTimeout
          ? `Evolution request timed out after ${timeoutMs}ms`
          : "Evolution request failed",
      },
    };
  } finally {
    clearTimeout(t);
  }
}

async function requestWithRetry<T>(
  opts: EvolutionRequestOptions,
): Promise<EvolutionResult<T>> {
  const attempts = opts.retryable ? MAX_ATTEMPTS : 1;
  let last: EvolutionResult<T> | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await doFetch<T>(opts);
    if (last.ok) return last;
    // Só re-tentar em timeout ou 5xx. 4xx é definitivo.
    if (
      last.error.code !== "UPSTREAM_TIMEOUT" &&
      last.error.code !== "UPSTREAM_5XX" &&
      last.error.code !== "UPSTREAM_ERROR"
    ) {
      return last;
    }
    if (i < attempts - 1) {
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((r) =>
        setTimeout(r, RETRY_BASE_MS * Math.pow(2, i) + jitter)
      );
    }
  }
  return last!;
}

// ============================================================
// Operações
// ============================================================

export function evolutionServerInfo(env: EvolutionEnv, requestId?: string) {
  return requestWithRetry<Record<string, unknown>>({
    env,
    method: "GET",
    path: "/",
    retryable: true,
    op: "serverInfo",
    requestId,
  });
}

export function evolutionFetchInstances(
  env: EvolutionEnv,
  instanceName?: string,
  requestId?: string,
) {
  const qs = instanceName
    ? `?instanceName=${encodeURIComponent(instanceName)}`
    : "";
  return requestWithRetry<EvolutionInstanceSummary[]>({
    env,
    method: "GET",
    path: `/instance/fetchInstances${qs}`,
    retryable: true,
    op: "fetchInstances",
    requestId,
  });
}

export function evolutionCreateInstance(
  env: EvolutionEnv,
  input: { instanceName: string; qrcode?: boolean },
  requestId?: string,
) {
  return requestWithRetry<EvolutionCreateInstanceResult>({
    env,
    method: "POST",
    path: "/instance/create",
    body: {
      instanceName: input.instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: input.qrcode ?? true,
    },
    retryable: false, // create não é idempotente
    op: "createInstance",
    requestId,
  });
}

export function evolutionConnect(
  env: EvolutionEnv,
  instanceName: string,
  requestId?: string,
) {
  return requestWithRetry<EvolutionQrCode>({
    env,
    method: "GET",
    path: `/instance/connect/${encodeURIComponent(instanceName)}`,
    retryable: true,
    op: "connect",
    requestId,
  });
}

export function evolutionConnectionState(
  env: EvolutionEnv,
  instanceName: string,
  requestId?: string,
) {
  return requestWithRetry<{ instance: EvolutionConnectionStateResult }>({
    env,
    method: "GET",
    path: `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    retryable: true,
    op: "connectionState",
    requestId,
  });
}

export function evolutionLogout(
  env: EvolutionEnv,
  instanceName: string,
  requestId?: string,
) {
  return requestWithRetry<Record<string, unknown>>({
    env,
    method: "DELETE",
    path: `/instance/logout/${encodeURIComponent(instanceName)}`,
    retryable: false,
    op: "logout",
    requestId,
  });
}

export function evolutionDeleteInstance(
  env: EvolutionEnv,
  instanceName: string,
  requestId?: string,
) {
  return requestWithRetry<Record<string, unknown>>({
    env,
    method: "DELETE",
    path: `/instance/delete/${encodeURIComponent(instanceName)}`,
    retryable: false,
    op: "delete",
    requestId,
  });
}

export function evolutionWebhookFind(
  env: EvolutionEnv,
  instanceName: string,
  requestId?: string,
) {
  return requestWithRetry<EvolutionWebhookConfig | null>({
    env,
    method: "GET",
    path: `/webhook/find/${encodeURIComponent(instanceName)}`,
    retryable: true,
    op: "webhookFind",
    requestId,
  });
}

export function evolutionWebhookSet(
  env: EvolutionEnv,
  instanceName: string,
  webhook: EvolutionWebhookConfig,
  requestId?: string,
) {
  return requestWithRetry<Record<string, unknown>>({
    env,
    method: "POST",
    path: `/webhook/set/${encodeURIComponent(instanceName)}`,
    body: { webhook },
    retryable: true, // upsert idempotente
    op: "webhookSet",
    requestId,
  });
}
