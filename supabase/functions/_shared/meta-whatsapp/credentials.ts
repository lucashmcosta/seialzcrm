// Helpers para resolver credenciais Meta WhatsApp Cloud.
//
// PR1-A: novo helper `resolveMetaCredentials(supabase, oiId)` que suporta
// dois modelos:
//   1) Novo: `organization_integrations.meta_credentials_id` → busca em
//      `meta_app_credentials` (credenciais compartilhadas por org, uma linha
//      por app Meta). `waba_id` vem de `organization_integrations.meta_waba_id`
//      quando preenchido; caso contrário, cai no `connected_account.waba_id`.
//   2) Legado (fallback): lê tudo de `organization_integrations.connected_account`.
//
// Enquanto M2 (backfill) não roda, todas as rows caem no fallback — comportamento
// idêntico ao anterior. Nada deve mudar em produção com este PR.
//
// Os helpers antigos `resolveAppSecretForIntegration` /
// `resolveVerifyTokenForIntegration` são mantidos para compatibilidade e para
// os call sites que só precisam de um segredo pontual (ex.: verify token no
// handshake GET do webhook).

import { decryptSecret } from "../crypto.ts";

// Tipo estrutural mínimo — evita depender de @supabase/supabase-js aqui.
type SupabaseLike = {
  from: (table: string) => any;
};

export interface ResolvedMetaCredentials {
  organizationId: string;
  organizationIntegrationId: string;
  appId?: string;
  appSecret?: string;
  accessToken: string;
  verifyToken?: string;
  wabaId?: string;
  phoneNumberId?: string;
  source: "meta_app_credentials" | "connected_account";
}

export class MetaCredentialsError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "MetaCredentialsError";
    this.code = code;
  }
}

async function tryDecrypt(
  enc: string | undefined | null,
  label: string,
): Promise<string | undefined> {
  if (!enc) return undefined;
  try {
    const dec = (await decryptSecret(enc)).trim();
    return dec || undefined;
  } catch (e) {
    console.error(`[meta-wa] decrypt ${label} failed`, (e as Error).message);
    return undefined;
  }
}

export async function resolveMetaCredentials(
  supabase: SupabaseLike,
  organizationIntegrationId: string,
): Promise<ResolvedMetaCredentials> {
  if (!organizationIntegrationId) {
    throw new MetaCredentialsError("missing_organization_integration_id");
  }

  const { data: oi, error } = await supabase
    .from("organization_integrations")
    .select(
      "id, organization_id, connected_account, config_values, meta_credentials_id, meta_waba_id",
    )
    .eq("id", organizationIntegrationId)
    .maybeSingle();

  if (error) {
    throw new MetaCredentialsError(
      "integration_lookup_failed",
      error.message,
    );
  }
  if (!oi) throw new MetaCredentialsError("integration_not_found");

  const ca = (oi.connected_account ?? {}) as Record<string, any>;
  const cv = (oi.config_values ?? {}) as Record<string, any>;

  // === Fonte 1: meta_app_credentials (nova) ===
  if (oi.meta_credentials_id) {
    const { data: cred, error: credErr } = await supabase
      .from("meta_app_credentials")
      .select(
        "id, app_id, app_secret_encrypted, access_token_encrypted, verify_token_encrypted",
      )
      .eq("id", oi.meta_credentials_id)
      .maybeSingle();

    if (credErr) {
      throw new MetaCredentialsError(
        "meta_app_credentials_lookup_failed",
        credErr.message,
      );
    }

    if (cred) {
      const accessToken = await tryDecrypt(
        cred.access_token_encrypted,
        "access_token(meta_app_credentials)",
      );
      if (!accessToken) {
        throw new MetaCredentialsError("missing_access_token");
      }
      const appSecret = await tryDecrypt(
        cred.app_secret_encrypted,
        "app_secret(meta_app_credentials)",
      );
      const verifyToken = await tryDecrypt(
        cred.verify_token_encrypted,
        "verify_token(meta_app_credentials)",
      );

      const wabaId =
        (oi.meta_waba_id as string | null) ??
        (ca.waba_id as string | undefined) ??
        (cv.waba_id as string | undefined);
      const phoneNumberId =
        (ca.phone_number_id as string | undefined) ??
        (cv.phone_number_id as string | undefined);

      return {
        organizationId: oi.organization_id,
        organizationIntegrationId: oi.id,
        appId: (cred.app_id as string | undefined) ??
          (ca.app_id as string | undefined),
        appSecret,
        accessToken,
        verifyToken,
        wabaId: wabaId ?? undefined,
        phoneNumberId,
        source: "meta_app_credentials",
      };
    }
    // Se meta_credentials_id apontar para linha inexistente, cai no fallback
    // (defensivo — não deveria acontecer com FK ON DELETE SET NULL).
    console.warn(
      "[meta-wa] meta_credentials_id set but row not found — falling back to connected_account",
      { organizationIntegrationId, meta_credentials_id: oi.meta_credentials_id },
    );
  }

  // === Fonte 2: connected_account (legado / fallback) ===
  const accessToken = await tryDecrypt(
    ca.access_token_encrypted,
    "access_token(connected_account)",
  );
  if (!accessToken) throw new MetaCredentialsError("missing_access_token");
  const appSecret = await tryDecrypt(
    ca.app_secret_encrypted,
    "app_secret(connected_account)",
  );
  const verifyToken = await tryDecrypt(
    ca.verify_token_encrypted,
    "verify_token(connected_account)",
  );

  const wabaId =
    (oi.meta_waba_id as string | null) ??
    (ca.waba_id as string | undefined) ??
    (cv.waba_id as string | undefined);
  const phoneNumberId =
    (ca.phone_number_id as string | undefined) ??
    (cv.phone_number_id as string | undefined);

  return {
    organizationId: oi.organization_id,
    organizationIntegrationId: oi.id,
    appId: ca.app_id as string | undefined,
    appSecret,
    accessToken,
    verifyToken,
    wabaId: wabaId ?? undefined,
    phoneNumberId,
    source: "connected_account",
  };
}

// ============================================================
// Helpers legados — mantidos para call sites que só precisam de
// um segredo pontual sem carregar toda a integração.
// ============================================================

export async function resolveAppSecretForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  return await tryDecrypt(
    connectedAccount?.app_secret_encrypted,
    "app_secret",
  );
}

export async function resolveVerifyTokenForIntegration(
  connectedAccount: Record<string, any> | null | undefined,
): Promise<string | undefined> {
  return await tryDecrypt(
    connectedAccount?.verify_token_encrypted,
    "verify_token",
  );
}

/**
 * Resolve o verify token de uma organization_integrations, preferindo
 * `meta_app_credentials` quando `meta_credentials_id` está presente e caindo
 * em `connected_account.verify_token_encrypted` caso contrário.
 * Uso: handshake GET do webhook Meta.
 */
export async function resolveVerifyTokenForOi(
  supabase: SupabaseLike,
  row: {
    meta_credentials_id?: string | null;
    connected_account?: Record<string, any> | null;
  },
): Promise<string | undefined> {
  if (row?.meta_credentials_id) {
    const { data: cred } = await supabase
      .from("meta_app_credentials")
      .select("verify_token_encrypted")
      .eq("id", row.meta_credentials_id)
      .maybeSingle();
    const fromNew = await tryDecrypt(
      cred?.verify_token_encrypted,
      "verify_token(meta_app_credentials)",
    );
    if (fromNew) return fromNew;
  }
  return await resolveVerifyTokenForIntegration(row?.connected_account ?? null);
}
