import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "./crypto.ts";

type AdminClient = ReturnType<typeof createClient>;

/**
 * Decrypts the encrypted Meta access token for the caller's own integration slug.
 *
 * Cross-slug fallback was removed intentionally. Each Meta integration
 * (`meta`, `meta-lead-ads`, `meta-capi`) MUST use its own token. If the
 * caller's token is missing or invalid, surface the failure so the user
 * reconnects the correct integration — never silently borrow another slug's token.
 */
export async function resolveMetaAccessToken(
  _admin: AdminClient,
  orgId: string,
  primaryEncryptedToken: string | null | undefined,
  callerSlug: string = "unknown",
): Promise<{ token: string; source: string }> {
  const primary = String(primaryEncryptedToken ?? "");

  if (!primary) {
    console.warn(
      `[meta-token] slug=${callerSlug} org=${orgId} result=fail reason=missing_token`,
    );
    throw new Error("token_decrypt_failed");
  }

  try {
    const token = await decryptSecret(primary);
    console.log(
      `[meta-token] slug=${callerSlug} org=${orgId} result=ok`,
    );
    return { token, source: callerSlug };
  } catch (error) {
    console.warn(
      `[meta-token] slug=${callerSlug} org=${orgId} result=fail reason=${(error as Error).message}`,
    );
    throw new Error("token_decrypt_failed");
  }
}
