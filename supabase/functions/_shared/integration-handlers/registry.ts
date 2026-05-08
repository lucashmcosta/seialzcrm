// Registry de handlers indexado por "{integration_slug}:{target_action}".
// Handlers de integrações específicas (kommo, etc.) se registram via side-effect
// de import em Phase 3+. webhook.dispatch já vem registrado por padrão.

import type { Handler } from "./types.ts";
import { webhookDispatchHandler } from "./webhook.ts";

const registry = new Map<string, Handler>();

export function register(slug: string, action: string, handler: Handler): void {
  registry.set(`${slug}:${action}`, handler);
}

export function resolve(slug: string, action: string): Handler | undefined {
  return registry.get(`${slug}:${action}`);
}

// Defaults
register("webhook", "dispatch", webhookDispatchHandler);
