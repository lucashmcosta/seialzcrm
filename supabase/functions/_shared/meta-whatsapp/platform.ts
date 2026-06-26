// Helpers de estado da configuração global da plataforma Meta WhatsApp Cloud.

export interface PlatformStatus {
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
  webhookActive: boolean;
}

export function getPlatformStatus(): PlatformStatus {
  const appSecret = Deno.env.get("META_WHATSAPP_APP_SECRET");
  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN");
  const hasAppSecret = !!appSecret && appSecret.length > 0;
  const hasVerifyToken = !!verifyToken && verifyToken.length > 0;
  return {
    appSecretConfigured: hasAppSecret,
    verifyTokenConfigured: hasVerifyToken,
    webhookActive: hasAppSecret && hasVerifyToken,
  };
}

export function isWebhookActive(): boolean {
  return getPlatformStatus().webhookActive;
}
