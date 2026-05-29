import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "./crypto.ts";

type AdminClient = ReturnType<typeof createClient>;

type TokenCandidate = {
  slug: string;
  encrypted: string;
  updatedAt: string | null;
  lastCheckedAt: string | null;
};

export async function getFallbackTokenCandidates(
  admin: AdminClient,
  orgId: string,
): Promise<TokenCandidate[]> {
  const { data: integrations, error: integErr } = await admin
    .from("admin_integrations")
    .select("id, slug")
    .in("slug", ["meta", "meta-lead-ads", "meta-capi"]);

  if (integErr || !integrations?.length) {
    throw new Error(integErr?.message || "Meta integrations not found");
  }

  const integrationIds = integrations.map((integration) => integration.id);
  const slugById = new Map(integrations.map((integration) => [integration.id, integration.slug]));

  const { data: rows, error: rowsErr } = await admin
    .from("organization_integrations")
    .select("integration_id, updated_at, connected_account")
    .eq("organization_id", orgId)
    .eq("is_enabled", true)
    .in("integration_id", integrationIds);

  if (rowsErr) {
    throw new Error(rowsErr.message);
  }

  const seen = new Set<string>();
  const candidates: TokenCandidate[] = [];

  for (const row of rows ?? []) {
    const slug = slugById.get(row.integration_id);
    const connectedAccount = (row.connected_account ?? {}) as Record<string, unknown>;
    const encrypted =
      slug === "meta-capi"
        ? String(connectedAccount.access_token_encrypted ?? "")
        : String(connectedAccount.system_user_token_encrypted ?? connectedAccount.access_token_encrypted ?? "");

    if (!slug || !encrypted || seen.has(encrypted)) continue;
    seen.add(encrypted);

    candidates.push({
      slug,
      encrypted,
      updatedAt: row.updated_at ?? null,
      lastCheckedAt:
        typeof connectedAccount.last_token_check_at === "string"
          ? connectedAccount.last_token_check_at
          : null,
    });
  }

  return candidates.sort((a, b) => {
    const aTime = Date.parse(a.lastCheckedAt || a.updatedAt || "1970-01-01T00:00:00.000Z");
    const bTime = Date.parse(b.lastCheckedAt || b.updatedAt || "1970-01-01T00:00:00.000Z");
    return bTime - aTime;
  });
}

export async function syncRecoveredTokenToMeta(
  admin: AdminClient,
  orgId: string,
  encryptedToken: string,
) {
  const { data: metaIntegration, error: metaIntegErr } = await admin
    .from("admin_integrations")
    .select("id")
    .eq("slug", "meta")
    .maybeSingle();

  if (metaIntegErr || !metaIntegration?.id) return;

  const { data: metaRow, error: metaRowErr } = await admin
    .from("organization_integrations")
    .select("id, connected_account")
    .eq("organization_id", orgId)
    .eq("integration_id", metaIntegration.id)
    .maybeSingle();

  if (metaRowErr || !metaRow?.id) return;

  const connectedAccount = (metaRow.connected_account ?? {}) as Record<string, unknown>;
  if (connectedAccount.system_user_token_encrypted === encryptedToken) return;

  const { error: updateErr } = await admin
    .from("organization_integrations")
    .update({
      connected_account: {
        ...connectedAccount,
        system_user_token_encrypted: encryptedToken,
        last_token_check_error: null,
        last_token_check_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", metaRow.id);

  if (updateErr) {
    console.warn("failed to sync recovered token to meta row:", updateErr.message);
  }
}

export async function resolveMetaAccessToken(
  admin: AdminClient,
  orgId: string,
  primaryEncryptedToken: string | null | undefined,
): Promise<{ token: string; source: string }> {
  const primary = String(primaryEncryptedToken ?? "");

  if (primary) {
    try {
      return { token: await decryptSecret(primary), source: "primary" };
    } catch (_error) {
      // Fall through to alternate candidates.
    }
  }

  const fallbackCandidates = await getFallbackTokenCandidates(admin, orgId);
  for (const candidate of fallbackCandidates) {
    try {
      const token = await decryptSecret(candidate.encrypted);
      if (candidate.slug !== "meta") {
        await syncRecoveredTokenToMeta(admin, orgId, candidate.encrypted);
      }
      return { token, source: candidate.slug };
    } catch (_error) {
      // Keep trying the next candidate.
    }
  }

  throw new Error("token_decrypt_failed");
}