// Shared helpers used by byok-* edge functions.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encryptSecret } from "../crypto.ts";

export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "gemini", "elevenlabs"] as const;
export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function isSupported(p: string): p is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p);
}

export function last4(key: string): string {
  return key.slice(-4);
}

export async function fingerprint(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex.slice(0, 16)}`;
}

/**
 * Test if an api key is accepted by the upstream provider.
 * Uses cheap "list" or "auth" endpoints. Returns sanitized result.
 */
export async function testProviderKey(
  provider: SupportedProvider,
  apiKey: string,
): Promise<{ ok: boolean; status: number; verified_model?: string }> {
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return { ok: r.ok, status: r.status, verified_model: "gpt-4o-mini" };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      return { ok: r.status === 200 || r.status === 400, status: r.status };
      // 400 still means key is valid (bad request shape); 401/403 means invalid.
    }
    if (provider === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
      return { ok: r.ok, status: r.status };
    }
    if (provider === "elevenlabs") {
      const r = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": apiKey },
      });
      return { ok: r.ok, status: r.status };
    }
  } catch {
    return { ok: false, status: 0 };
  }
  return { ok: false, status: 0 };
}

/**
 * Locate the organization_integrations row to attach the BYOK secret to.
 * Strategy: pick the first row for this org (we store all provider secrets
 * in a single jsonb on any row belonging to the org — they're not bound to
 * a specific integration). If none exists, create a synthetic row tied to
 * a special slug "ai-byok".
 */
export async function getOrCreateByokRow(
  admin: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data: ai } = await admin
    .from("admin_integrations")
    .select("id")
    .eq("slug", "ai-byok")
    .maybeSingle();

  let integrationId: string;
  if (ai?.id) {
    integrationId = ai.id;
  } else {
    const { data: created, error } = await admin
      .from("admin_integrations")
      .insert({
        slug: "ai-byok",
        name: "AI BYOK",
        category: "ai",
        is_active: true,
        is_visible: false,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("byok_integration_create_failed");
    integrationId = created.id;
  }

  const { data: existing } = await admin
    .from("organization_integrations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: newRow, error: insErr } = await admin
    .from("organization_integrations")
    .insert({
      organization_id: organizationId,
      integration_id: integrationId,
      is_enabled: true,
      secret_payload: {},
    })
    .select("id")
    .single();
  if (insErr || !newRow) throw new Error("byok_row_create_failed");
  return newRow.id;
}

export async function readByokRow(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ id: string; secret_payload: Record<string, any> } | null> {
  const { data } = await admin
    .from("admin_integrations")
    .select("id")
    .eq("slug", "ai-byok")
    .maybeSingle();
  if (!data?.id) return null;
  const { data: row } = await admin
    .from("organization_integrations")
    .select("id, secret_payload")
    .eq("organization_id", organizationId)
    .eq("integration_id", data.id)
    .maybeSingle();
  if (!row) return null;
  return { id: row.id, secret_payload: (row.secret_payload ?? {}) as Record<string, any> };
}

export async function writeSecretEntry(
  admin: SupabaseClient,
  rowId: string,
  current: Record<string, any>,
  provider: string,
  entry: Record<string, any>,
): Promise<void> {
  const next = { ...current, [provider]: entry };
  const { error } = await admin
    .from("organization_integrations")
    .update({ secret_payload: next })
    .eq("id", rowId);
  if (error) throw new Error(`secret_update_failed: ${error.message}`);
}

export { encryptSecret };
