// Pricing lookup from provider_pricing table. Cached per worker invocation.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Row = {
  provider: string;
  model: string;
  input_per_1k_usd: number | null;
  output_per_1k_usd: number | null;
  audio_per_minute_usd: number | null;
};

let cache: Map<string, Row> | null = null;
let cacheAt = 0;
const TTL_MS = 5 * 60_000;

async function load(admin: SupabaseClient): Promise<Map<string, Row>> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const { data } = await admin
    .from("provider_pricing")
    .select("provider, model, input_per_1k_usd, output_per_1k_usd, audio_per_minute_usd, effective_from")
    .order("effective_from", { ascending: false });
  const m = new Map<string, Row>();
  for (const r of (data ?? []) as any[]) {
    const k = `${r.provider}::${r.model}`;
    if (!m.has(k)) m.set(k, r); // newest effective_from wins
  }
  cache = m;
  cacheAt = Date.now();
  return m;
}

export async function estimateTextCostUsd(
  admin: SupabaseClient,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number | null> {
  const m = await load(admin);
  const row = m.get(`${provider}::${model}`);
  if (!row) return null;
  const inp = (row.input_per_1k_usd ?? 0) * (promptTokens / 1000);
  const out = (row.output_per_1k_usd ?? 0) * (completionTokens / 1000);
  return Number((inp + out).toFixed(8));
}

export async function estimateAudioCostUsd(
  admin: SupabaseClient,
  provider: string,
  model: string,
  durationSeconds: number,
): Promise<number | null> {
  const m = await load(admin);
  const row = m.get(`${provider}::${model}`);
  if (!row?.audio_per_minute_usd) return null;
  return Number(((durationSeconds / 60) * row.audio_per_minute_usd).toFixed(8));
}
