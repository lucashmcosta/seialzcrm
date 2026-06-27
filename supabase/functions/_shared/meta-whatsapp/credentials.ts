// Helper para resolver credenciais Meta (App Secret / Verify Token)
// per-integration, com fallback ao secret global enquanto a migração
// Fase 1 → Fase 3 ainda não foi concluída para todos os tenants.
import { decryptSecret } from "../crypto.ts";

export async function resolveAppSecretForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const enc = connectedAccount?.app_secret_encrypted as string | undefined;
  if (enc) {
    try {
      const dec = (await decryptSecret(enc)).trim();
      if (dec) return dec;
    } catch (e) {
      console.error("[meta-wa] decrypt app_secret failed", (e as Error).message);
    }
  }
  const fallback = Deno.env.get("META_WHATSAPP_APP_SECRET")?.trim();
  return fallback || undefined;
}

export async function resolveVerifyTokenForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const enc = connectedAccount?.verify_token_encrypted as string | undefined;
  if (enc) {
    try {
      const dec = (await decryptSecret(enc)).trim();
      if (dec) return dec;
    } catch (e) {
      console.error("[meta-wa] decrypt verify_token failed", (e as Error).message);
    }
  }
  return undefined;
}

export function globalVerifyToken(): string | undefined {
  return Deno.env.get("META_WHATSAPP_VERIFY_TOKEN")?.trim() || undefined;
}

export function globalAppSecret(): string | undefined {
  return Deno.env.get("META_WHATSAPP_APP_SECRET")?.trim() || undefined;
}
