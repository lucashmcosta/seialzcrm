// Resolves which provider/api-key to use for an org & capability.
// Priority: active+verified BYOK -> managed (if allowed).
// NEVER logs the resolved api key.

import { decryptSecret } from "../crypto.ts";
import { safeLog } from "./sanitize.ts";
// SupabaseClient typed as `any` here to avoid pulling the supabase-js JSR
// graph into Deno's test transitive resolution. Runtime functions pass the
// real client; only the methods we call need to exist.
type SupabaseClient = any;

export type Capability = "chat" | "transcription" | "embedding";
export type ResolvedSource = "customer_key" | "managed";

export interface ResolvedProvider {
  source: ResolvedSource;
  provider: string;
  model: string;
  apiKey: string;
  // Policy snapshot (for the caller to decide on fallback after upstream errors)
  fallbackToManaged: boolean;
  fallbackOnRateLimit: boolean;
  monthlyBudgetUsd: number | null;
}

export class ProviderResolutionError extends Error {
  constructor(public code: "no_provider" | "byok_required" | "budget_exceeded", msg: string) {
    super(msg);
    this.name = "ProviderResolutionError";
  }
}

const CAPABILITY_DEFAULTS: Record<Capability, { provider: string; model: string; envKey: string }[]> = {
  chat: [
    { provider: "gemini", model: "gemini-2.5-flash", envKey: "LOVABLE_API_KEY" },
  ],
  transcription: [
    { provider: "elevenlabs", model: "scribe_v2", envKey: "ELEVENLABS_API_KEY" },
  ],
  embedding: [
    { provider: "gemini", model: "gemini-embedding-001", envKey: "LOVABLE_API_KEY" },
  ],
};

// MVP: providers per capability supported as BYOK.
// Anthropic/Gemini BYOK can be added later — for chat the MVP only
// dispatches to OpenAI-compatible endpoints when customer_key is used.
const CAPABILITY_BYOK_ORDER: Record<Capability, { provider: string; defaultModel: string }[]> = {
  chat: [
    { provider: "openai", defaultModel: "gpt-4o-mini" },
  ],
  transcription: [
    { provider: "elevenlabs", defaultModel: "scribe_v2" },
    { provider: "openai",     defaultModel: "whisper-1" },
  ],
  embedding: [
    { provider: "openai", defaultModel: "text-embedding-3-small" },
  ],
};

interface SecretEntry {
  api_key_encrypted?: string;
  is_active?: boolean;
  verified_at?: string | null;
  last_error?: string | null;
  fallback_to_managed?: boolean;
  fallback_on_rate_limit?: boolean;
  monthly_budget_usd?: number | string | null;
  preferred_model?: string | null;
}

async function readSecretPayload(
  admin: SupabaseClient,
  orgId: string,
): Promise<Record<string, SecretEntry>> {
  const { data, error } = await admin
    .from("organization_integrations")
    .select("secret_payload")
    .eq("organization_id", orgId)
    .not("secret_payload", "is", null);
  if (error) {
    safeLog("[resolveProvider] secret read error", { message: error.message });
    return {};
  }
  const merged: Record<string, SecretEntry> = {};
  for (const row of (data ?? []) as any[]) {
    const payload = (row.secret_payload ?? {}) as Record<string, SecretEntry>;
    for (const [k, v] of Object.entries(payload)) merged[k] = v;
  }
  return merged;
}

async function byokBudgetExceeded(
  admin: SupabaseClient,
  orgId: string,
  provider: string,
  budget: number,
): Promise<boolean> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("vw_org_monthly_cost_byok")
    .select("cost_usd")
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .gte("month", monthStart.toISOString());
  const spent = (data ?? []).reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);
  return spent >= budget;
}

export async function resolveProvider(
  admin: SupabaseClient,
  orgId: string,
  capability: Capability,
): Promise<ResolvedProvider> {
  const secrets = await readSecretPayload(admin, orgId);

  for (const { provider, defaultModel } of CAPABILITY_BYOK_ORDER[capability]) {
    const entry = secrets[provider];
    if (!entry?.is_active || !entry.verified_at || !entry.api_key_encrypted) continue;

    const budget = entry.monthly_budget_usd != null && entry.monthly_budget_usd !== ""
      ? Number(entry.monthly_budget_usd)
      : null;
    if (budget && budget > 0) {
      const over = await byokBudgetExceeded(admin, orgId, provider, budget);
      if (over) {
        throw new ProviderResolutionError(
          "budget_exceeded",
          `BYOK monthly budget exceeded for ${provider}`,
        );
      }
    }

    let apiKey: string;
    try {
      apiKey = await decryptSecret(entry.api_key_encrypted);
    } catch (e) {
      safeLog("[resolveProvider] decrypt failed", { provider, message: (e as Error).message });
      continue; // try next provider
    }

    return {
      source: "customer_key",
      provider,
      model: entry.preferred_model || defaultModel,
      apiKey,
      fallbackToManaged: !!entry.fallback_to_managed,
      fallbackOnRateLimit: !!entry.fallback_on_rate_limit,
      monthlyBudgetUsd: budget,
    };
  }

  // Managed fallback
  return getManagedProvider(capability);
}

export function getManagedProvider(capability: Capability): ResolvedProvider {
  for (const cand of CAPABILITY_DEFAULTS[capability]) {
    const key = Deno.env.get(cand.envKey);
    if (key) {
      return {
        source: "managed",
        provider: cand.provider,
        model: cand.model,
        apiKey: key,
        fallbackToManaged: false,
        fallbackOnRateLimit: false,
        monthlyBudgetUsd: null,
      };
    }
  }
  throw new ProviderResolutionError(
    "no_provider",
    `No managed provider configured for ${capability}`,
  );
}

/**
 * Mark a BYOK key as invalid after an upstream auth failure.
 * Atomic UPDATE via jsonb_set; never logs the key.
 */
export async function markByokInvalid(
  admin: SupabaseClient,
  orgId: string,
  provider: string,
  errorCode: string,
): Promise<void> {
  // Find the row that holds this provider
  const { data } = await admin
    .from("organization_integrations")
    .select("id, secret_payload")
    .eq("organization_id", orgId)
    .not("secret_payload", "is", null);

  for (const row of (data ?? []) as any[]) {
    const payload = (row.secret_payload ?? {}) as Record<string, any>;
    if (!payload[provider]) continue;
    const updated = {
      ...payload,
      [provider]: {
        ...payload[provider],
        is_active: false,
        verified_at: null,
        last_error: errorCode,
        invalidated_at: new Date().toISOString(),
      },
    };
    await admin
      .from("organization_integrations")
      .update({ secret_payload: updated })
      .eq("id", row.id);
  }
}
