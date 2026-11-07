// Acesso Meta Ads (Performance) da org — aplica a MESMA regra de resolveOrgMetaToken:
// canônico quando (flag `meta_canonical_credential` ON) OU (org sem credencial legada
// utilizável); senão legado, exatamente como antes. Só backend/service_role.
//
// - legado: token = get_meta_credentials.system_user_token_encrypted (ou um loader
//   próprio do caller, ex. marketing-campaign-enrich lê o slug meta-lead-ads);
//   adAccountIds = [ad_account_id salvo por meta-ads-manager-save].
// - canônico: conexão via resolveConnectionWithAsset(…,'ad_account') + resolveConnectionToken;
//   adAccountIds = ativos ad_account `selected` dessa conexão (forma act_…).
// Com flag ON e canônico indisponível, cai no legado (fallback-on-failure).
import { decryptSecret } from "../crypto.ts";
import { facebookAppSecret, isCanonicalFlagOn, resolveConnectionToken, resolveConnectionWithAsset } from "./connection.ts";

export function normalizeAdAccountId(id: string): string {
  const t = String(id ?? "").trim();
  if (!t) return "";
  return t.startsWith("act_") ? t : `act_${t}`;
}

/** Credencial legada como cada caller a enxerga hoje. tokenEncrypted null => sem legado utilizável. */
export interface LegacyAdsCredential {
  tokenEncrypted: string | null;
  appSecretEncrypted?: string | null;
  adAccountId: string | null;
  /** Semântica legada (get_meta_credentials.feature_ads_manager_sync). */
  syncEnabled: boolean;
  /** Valor explícito salvo em config_values.feature_ads_manager_sync (undefined = nunca salvo). */
  syncConfigured?: boolean;
  /** Slug/linha de origem (p/ logs e marcação de erro de token no legado). */
  source?: string | null;
  meta_user_id?: string | null;
  meta_user_name?: string | null;
}

export interface OrgAdsAccess {
  token: string;
  appSecret?: string;
  source: "canonical" | "legacy";
  reason: "flag" | "no_legacy" | "legacy";
  connection_id?: string;
  /** canônico: todas as ad accounts selecionadas; legado: [ad_account_id salvo] ou []. */
  adAccountIds: string[];
  /** Ad account salva por meta-ads-manager-save (normalizada) — pode ser null. */
  savedAdAccountId: string | null;
  /** Sync de Ads habilitado (legado: regra do RPC; canônico: só desliga se salvo false). */
  syncEnabled: boolean;
  legacy: LegacyAdsCredential | null;
}

export type OrgAdsAccessResult =
  | { ok: true; access: OrgAdsAccess }
  | { ok: false; reason: "creds_error" | "no_credential" | "decrypt_failed"; message: string; legacy: LegacyAdsCredential | null };

/** Loader padrão: o mesmo RPC que as funções de Ads usavam. */
export async function loadLegacyFromRpc(admin: any, orgId: string): Promise<LegacyAdsCredential | null> {
  const { data, error } = await admin.rpc("get_meta_credentials", { p_org_id: orgId });
  if (error) throw new Error(`creds: ${error.message}`);
  const cred: any = data?.[0];
  if (!cred?.is_connected) return null;
  const cfg = cred.raw_config_values?.feature_ads_manager_sync;
  return {
    tokenEncrypted: cred.system_user_token_encrypted || null,
    adAccountId: cred.ad_account_id || null,
    syncEnabled: cred.feature_ads_manager_sync === true,
    syncConfigured: typeof cfg === "boolean" ? cfg : undefined,
    source: cred.source ?? null,
    meta_user_id: cred.meta_user_id ?? null,
    meta_user_name: cred.meta_user_name ?? null,
  };
}

async function canonicalAds(admin: any, orgId: string): Promise<{ connection_id: string; adAccountIds: string[] } | null> {
  const resolved = await resolveConnectionWithAsset(admin, orgId, "ad_account");
  if (!resolved) return null;
  const { data, error } = await admin.from("meta_assets").select("external_id")
    .eq("connection_id", resolved.connection_id).eq("organization_id", orgId)
    .eq("asset_type", "ad_account").eq("selection_state", "selected")
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error("asset_lookup_failed");
  const ids = [...new Set(((data ?? []) as any[]).map((r) => normalizeAdAccountId(r.external_id)).filter(Boolean))];
  return ids.length ? { connection_id: resolved.connection_id, adAccountIds: ids } : null;
}

export async function resolveOrgAdsAccess(
  admin: any,
  orgId: string,
  opts: { loadLegacy?: () => Promise<LegacyAdsCredential | null>; tag?: string } = {},
): Promise<OrgAdsAccessResult> {
  const tag = opts.tag ?? "ads";
  let legacy: LegacyAdsCredential | null;
  try {
    legacy = opts.loadLegacy ? await opts.loadLegacy() : await loadLegacyFromRpc(admin, orgId);
  } catch (e) {
    return { ok: false, reason: "creds_error", message: (e as Error).message, legacy: null };
  }
  const flagOn = await isCanonicalFlagOn(admin, orgId);
  const hasLegacy = !!legacy?.tokenEncrypted;
  const savedAdAccountId = legacy?.adAccountId ? normalizeAdAccountId(legacy.adAccountId) : null;

  const tryCanonical = async (reason: "flag" | "no_legacy"): Promise<OrgAdsAccess | null> => {
    try {
      const c = await canonicalAds(admin, orgId);
      if (!c) {
        console.log(`[meta-token] cap=${tag} org=${orgId} source=canonical reason=${reason} result=no_connection`);
        return null;
      }
      const token = await resolveConnectionToken(admin, c.connection_id);
      console.log(`[meta-token] cap=${tag} org=${orgId} source=canonical reason=${reason} connection=${c.connection_id} result=ok`);
      return {
        token, appSecret: facebookAppSecret(), source: "canonical", reason, connection_id: c.connection_id,
        adAccountIds: c.adAccountIds, savedAdAccountId,
        syncEnabled: legacy?.syncConfigured !== false,
        legacy,
      };
    } catch (e) {
      console.warn(`[meta-token] cap=${tag} org=${orgId} source=canonical reason=${reason} result=fail detail=${(e as Error).message}`);
      return null;
    }
  };

  if (flagOn || !hasLegacy) {
    const c = await tryCanonical(flagOn ? "flag" : "no_legacy");
    if (c) return { ok: true, access: c };
    if (!hasLegacy) {
      return { ok: false, reason: "no_credential", message: "no_meta_credential_any_source", legacy };
    }
    console.log(`[meta-token] cap=${tag} org=${orgId} fallback=legacy`);
  }

  let token: string;
  let appSecret: string | undefined;
  try {
    token = await decryptSecret(legacy!.tokenEncrypted!);
    appSecret = legacy!.appSecretEncrypted ? await decryptSecret(legacy!.appSecretEncrypted) : undefined;
    console.log(`[meta-token] cap=${tag} slug=${legacy!.source ?? "meta"} org=${orgId} source=legacy result=ok`);
  } catch (e) {
    console.warn(`[meta-token] cap=${tag} slug=${legacy!.source ?? "meta"} org=${orgId} source=legacy result=fail reason=${(e as Error).message}`);
    return { ok: false, reason: "decrypt_failed", message: (e as Error).message, legacy };
  }
  return {
    ok: true,
    access: {
      token, appSecret, source: "legacy", reason: "legacy",
      adAccountIds: savedAdAccountId ? [savedAdAccountId] : [],
      savedAdAccountId,
      syncEnabled: legacy!.syncEnabled,
      legacy,
    },
  };
}

/** Ad accounts que o sync deve processar: no canônico, a salva (se ainda selecionada) ou todas as selecionadas. */
export function syncAdAccountIds(access: OrgAdsAccess): string[] {
  if (access.source === "canonical" && access.savedAdAccountId && access.adAccountIds.includes(access.savedAdAccountId)) {
    return [access.savedAdAccountId];
  }
  return access.adAccountIds;
}

/**
 * Orgs com conexão canônica `connected` e ao menos uma ad account selecionada.
 * Usado pelos crons p/ incluir orgs só-canônicas na iteração (dedupe é do caller).
 */
export async function listCanonicalAdsOrgIds(admin: any): Promise<string[]> {
  const { data: conns, error } = await admin.from("meta_connections").select("id, organization_id").eq("status", "connected");
  if (error || !conns?.length) return [];
  const ids = (conns as any[]).map((c) => c.id);
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: assets, error: aErr } = await admin.from("meta_assets").select("organization_id")
      .in("connection_id", ids.slice(i, i + 200)).eq("asset_type", "ad_account").eq("selection_state", "selected");
    if (aErr) continue;
    for (const a of (assets ?? []) as any[]) if (a.organization_id) out.add(a.organization_id);
  }
  return [...out];
}
