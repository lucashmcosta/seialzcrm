// Insert into ai_usage_logs with sanitized payload.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { safeLog } from "./sanitize.ts";

export type UsageSource = "managed" | "customer_key" | "managed_fallback";

export interface UsageLog {
  organization_id: string;
  user_id?: string | null;
  provider: string;
  model: string;
  source: UsageSource;
  action: string; // e.g. 'analyze_message', 'transcribe_audio'
  integration_slug?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  job_id?: string | null;
}

export async function logAiUsage(admin: SupabaseClient, row: UsageLog): Promise<void> {
  try {
    const { error } = await admin.from("ai_usage_logs").insert({
      organization_id: row.organization_id,
      user_id: row.user_id ?? null,
      provider: row.provider,
      model_used: row.model,
      source: row.source,
      action: row.action,
      integration_slug: row.integration_slug ?? row.provider,
      prompt_tokens: row.prompt_tokens ?? null,
      completion_tokens: row.completion_tokens ?? null,
      total_tokens: row.total_tokens ?? null,
      estimated_cost_usd: row.estimated_cost_usd ?? null,
      entity_type: row.entity_type ?? null,
      entity_id: row.entity_id ?? null,
      job_id: row.job_id ?? null,
    });
    if (error) safeLog("[logAiUsage] insert error", { message: error.message });
  } catch (e) {
    safeLog("[logAiUsage] threw", { message: (e as Error).message });
  }
}
