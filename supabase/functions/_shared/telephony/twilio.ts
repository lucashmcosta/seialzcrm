import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "../integration-credentials.ts";
import type { VoiceProviderAdapter, VoiceSession } from "./types.ts";
import { validateTwilioRequestSignature } from "../twilio-signature.ts";

export interface TwilioVoiceConfig {
  integrationId: string;
  accountSid: string;
  authToken: string;
  twimlAppSid: string;
  apiKeySid?: string;
  apiKeySecret?: string;
}

export function twilioVoiceIdentity(
  userId: string,
  organizationId: string,
): string {
  if (typeof userId !== "string" || typeof organizationId !== "string") {
    throw new Error("invalid_twilio_voice_identity");
  }
  const user = userId.replace(/[^A-Za-z0-9]/g, "");
  const organization = organizationId.replace(/[^A-Za-z0-9]/g, "");
  const identity = `user_${user}_org_${organization}`;
  if (!user || !organization || identity.length > 121) {
    throw new Error("invalid_twilio_voice_identity");
  }
  return identity;
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

async function decryptMaybe(
  ciphertext: unknown,
  plaintext: unknown,
): Promise<string> {
  if (typeof ciphertext === "string" && ciphertext.startsWith("v1.")) {
    return await decryptIntegrationSecret(ciphertext);
  }
  return typeof plaintext === "string" ? plaintext : "";
}

// deno-lint-ignore no-explicit-any
export async function loadTwilioVoiceConfig(
  admin: any,
  organizationId: string,
): Promise<TwilioVoiceConfig> {
  const { data: row, error } = await admin
    .from("organization_integrations")
    .select("id, config_values, admin_integrations!inner(slug)")
    .eq("organization_id", organizationId)
    .eq("admin_integrations.slug", "twilio-voice")
    .eq("is_enabled", true)
    .maybeSingle();
  if (error || !row) throw new Error("twilio_voice_not_configured");
  const config = (row.config_values ?? {}) as Record<string, unknown>;
  const authToken = await decryptMaybe(
    config.auth_token_encrypted,
    config.auth_token,
  );
  const apiKeySecret = await decryptMaybe(
    config.api_key_secret_encrypted,
    config.api_key_secret,
  );
  if (!config.account_sid || !authToken || !config.twiml_app_sid) {
    throw new Error("twilio_voice_incomplete");
  }
  // Opportunistic one-way migration for legacy plaintext credentials.
  if (
    (!config.auth_token_encrypted && authToken) ||
    (!config.api_key_secret_encrypted && apiKeySecret)
  ) {
    const secured = { ...config };
    if (!config.auth_token_encrypted && authToken) {
      secured.auth_token_encrypted = await encryptIntegrationSecret(authToken);
      delete secured.auth_token;
    }
    if (!config.api_key_secret_encrypted && apiKeySecret) {
      secured.api_key_secret_encrypted = await encryptIntegrationSecret(
        apiKeySecret,
      );
      delete secured.api_key_secret;
    }
    const { error: secureError } = await admin.from("organization_integrations")
      .update({ config_values: secured }).eq("id", row.id);
    if (secureError) throw new Error("twilio_credential_migration_failed");
  }
  return {
    integrationId: row.id,
    accountSid: String(config.account_sid),
    authToken,
    twimlAppSid: String(config.twiml_app_sid),
    apiKeySid: typeof config.api_key_sid === "string"
      ? config.api_key_sid
      : undefined,
    apiKeySecret: apiKeySecret || undefined,
  };
}

// deno-lint-ignore no-explicit-any
async function ensureApiKey(
  admin: any,
  organizationId: string,
  config: TwilioVoiceConfig,
): Promise<TwilioVoiceConfig> {
  if (config.apiKeySid && config.apiKeySecret) return config;
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Keys.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${
          btoa(`${config.accountSid}:${config.authToken}`)
        }`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        FriendlyName: `Seialz Voice - ${organizationId.slice(0, 8)}`,
      }),
    },
  );
  if (!response.ok) throw new Error("twilio_api_key_creation_failed");
  const created = await response.json();
  const encryptedSecret = await encryptIntegrationSecret(
    String(created.secret),
  );
  const { data: current } = await admin
    .from("organization_integrations")
    .select("config_values")
    .eq("id", config.integrationId)
    .single();
  const next = {
    ...((current?.config_values ?? {}) as Record<string, unknown>),
  };
  delete next.api_key_secret;
  next.api_key_sid = created.sid;
  next.api_key_secret_encrypted = encryptedSecret;
  await admin.from("organization_integrations").update({ config_values: next })
    .eq("id", config.integrationId);
  return {
    ...config,
    apiKeySid: String(created.sid),
    apiKeySecret: String(created.secret),
  };
}

// deno-lint-ignore no-explicit-any
export class TwilioVoiceAdapter implements VoiceProviderAdapter {
  readonly provider = "twilio" as const;
  constructor(private readonly admin: any) {}

  connectionParams(input: {
    to: string;
    callId: string;
    phoneNumberId: string;
  }): Record<string, string> {
    return {
      To: input.to,
      CallId: input.callId,
      PhoneNumberId: input.phoneNumberId,
    };
  }

  consultationParams(input: {
    callId: string;
    transferId: string;
    targetUserId: string;
    consultationSequence: number;
  }): Record<string, string> {
    return {
      Mode: "consult",
      CallId: input.callId,
      TransferId: input.transferId,
      TargetUserId: input.targetUserId,
      ConsultationSequence: String(input.consultationSequence),
    };
  }

  async verifyWebhook(input: {
    request: Request;
    params: Record<string, string>;
    organizationId: string;
  }): Promise<boolean> {
    const config = await loadTwilioVoiceConfig(
      this.admin,
      input.organizationId,
    );
    const canonicalWebhookBase =
      Deno.env.get("TELEPHONY_WEBHOOK_PUBLIC_BASE_URL") ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/telephony-webhook`;
    const result = await validateTwilioRequestSignature({
      req: input.request,
      params: input.params,
      authToken: config.authToken,
      publicBaseUrl: canonicalWebhookBase,
    });
    if (!result.valid) {
      console.warn("[twilio-voice-adapter] invalid_signature", {
        reason: result.reason,
        checked: result.checked,
      });
    }
    return result.valid;
  }

  normalizeStatus(status: string | null | undefined): string {
    return (status || "queued").toLowerCase();
  }

  recordingMediaUrl(providerUrl: string): string {
    return providerUrl.endsWith(".mp3") ? providerUrl : `${providerUrl}.mp3`;
  }

  async issueSession(
    input: { organizationId: string; userId: string },
  ): Promise<VoiceSession> {
    let config = await loadTwilioVoiceConfig(this.admin, input.organizationId);
    config = await ensureApiKey(this.admin, input.organizationId, config);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600;
    const identity = twilioVoiceIdentity(input.userId, input.organizationId);
    const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
    const payload = {
      jti: `${config.apiKeySid}-${crypto.randomUUID()}`,
      iss: config.apiKeySid,
      sub: config.accountSid,
      exp: expiresAt,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: config.twimlAppSid },
        },
      },
    };
    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(config.apiKeySecret!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(unsigned),
    );
    return {
      provider: this.provider,
      token: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
      identity,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }
}

export function normalizeE164BR(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("55") && cleaned.length >= 12) return `+${cleaned}`;
  return `+55${cleaned}`;
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  ).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
