// Helper para resolver credenciais Meta (App Secret / Verify Token)
// estritamente per-integration. A leitura dos secrets globais
// META_WHATSAPP_APP_SECRET / META_WHATSAPP_VERIFY_TOKEN foi removida
// na Fase 3 — cada tenant precisa ter as próprias credenciais cifradas
// em organization_integrations.connected_account.
import { decryptSecret } from "../crypto.ts";

export async function resolveAppSecretForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const enc = connectedAccount?.app_secret_encrypted as string | undefined;
  if (!enc) return undefined;
  try {
    const dec = (await decryptSecret(enc)).trim();
    return dec || undefined;
  } catch (e) {
    console.error("[meta-wa] decrypt app_secret failed", (e as Error).message);
    return undefined;
  }
}

export async function resolveVerifyTokenForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  const enc = connectedAccount?.verify_token_encrypted as string | undefined;
  if (!enc) return undefined;
  try {
    const dec = (await decryptSecret(enc)).trim();
    return dec || undefined;
  } catch (e) {
    console.error("[meta-wa] decrypt verify_token failed", (e as Error).message);
    return undefined;
  }
}
