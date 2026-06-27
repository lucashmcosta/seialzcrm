// Helper para resolver credenciais Meta (App Secret / Verify Token)
// per-integration, com fallback ao secret global enquanto a migração
// Fase 1 → Fase 3 ainda não foi concluída para todos os tenants.
import { decryptSecret } from "../crypto.ts";

// Logs temporários (Fase 2) para confirmar que cada tenant migrado está
// usando credenciais per-integration e não caindo no fallback global.
// Remover quando a Fase 3 começar.
function logSource(kind: "app_secret" | "verify_token", source: "per_integration" | "global_fallback" | "none", phoneNumberId?: string | null) {
  console.log(`[meta-wa][credentials] ${kind}_source=${source} phone_number_id=${phoneNumberId ?? "unknown"}`);
}

export async function resolveAppSecretForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const phoneNumberId = connectedAccount?.phone_number_id as string | undefined;
  const enc = connectedAccount?.app_secret_encrypted as string | undefined;
  if (enc) {
    try {
      const dec = (await decryptSecret(enc)).trim();
      if (dec) {
        logSource("app_secret", "per_integration", phoneNumberId);
        return dec;
      }
    } catch (e) {
      console.error("[meta-wa] decrypt app_secret failed", (e as Error).message);
    }
  }
  const fallback = Deno.env.get("META_WHATSAPP_APP_SECRET")?.trim();
  if (fallback) {
    logSource("app_secret", "global_fallback", phoneNumberId);
    return fallback;
  }
  logSource("app_secret", "none", phoneNumberId);
  return undefined;
}

export async function resolveVerifyTokenForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const phoneNumberId = connectedAccount?.phone_number_id as string | undefined;
  const enc = connectedAccount?.verify_token_encrypted as string | undefined;
  if (enc) {
    try {
      const dec = (await decryptSecret(enc)).trim();
      if (dec) {
        logSource("verify_token", "per_integration", phoneNumberId);
        return dec;
      }
    } catch (e) {
      console.error("[meta-wa] decrypt verify_token failed", (e as Error).message);
    }
  }
  logSource("verify_token", "none", phoneNumberId);
  return undefined;
}

export function globalVerifyToken(): string | undefined {
  return Deno.env.get("META_WHATSAPP_VERIFY_TOKEN")?.trim() || undefined;
}

export function globalAppSecret(): string | undefined {
  return Deno.env.get("META_WHATSAPP_APP_SECRET")?.trim() || undefined;
}
