// Cache em memória do isolate (TTL 60s) para evitar lookup por request.
// Rollback efetivo em ≤ 60s após flip da flag.
const cache = new Map<string, { value: boolean; expiresAt: number }>();
const TTL_MS = 60_000;

// deno-lint-ignore no-explicit-any
export async function featureFlagEnabled(
  supabase: any,
  key: string,
  orgId: string | null,
): Promise<boolean> {
  const cacheKey = `${key}::${orgId ?? "global"}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const { data, error } = await supabase.rpc("fn_feature_flag_enabled", {
      _flag_key: key,
      _organization_id: orgId,
    });
    const value = !error && data === true;
    cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch {
    // best-effort: nunca quebra o caller
    return false;
  }
}
