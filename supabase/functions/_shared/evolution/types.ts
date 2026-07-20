// Evolution API — Tipos compartilhados
// Baseado nos contratos observados na Fase 0 (DISCOVERY.md).
// Fase 3: apenas definição. Nenhum consumo em runtime produtivo.

export const EVOLUTION_WEBHOOK_CONTRACT_VERSION = "v1" as const;

export type EvolutionIntegration = "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS";

export type EvolutionConnectionState =
  | "open"
  | "connecting"
  | "close"
  | "unknown";

export interface EvolutionInstanceSummary {
  id: string;
  name: string;
  clientName: string;
  integration: EvolutionIntegration;
  connectionStatus: EvolutionConnectionState;
  number: string | null;
  ownerJid: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
}

export interface EvolutionCreateInstanceResult {
  instanceName: string;
  instanceId: string;
  integration: EvolutionIntegration;
  status: EvolutionConnectionState;
  // token da instância (hash). NUNCA retornar direto ao cliente.
  hash: string;
  qrcode: EvolutionQrCode | null;
}

export interface EvolutionQrCode {
  pairingCode: string | null;
  // string bruta do QR (WA linking code)
  code: string | null;
  // data URL PNG (data:image/png;base64,...)
  base64: string | null;
  count: number;
}

export interface EvolutionConnectionStateResult {
  instanceName: string;
  state: EvolutionConnectionState;
}

export interface EvolutionWebhookConfig {
  enabled: boolean;
  url: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events: EvolutionWebhookEvent[];
  headers?: Record<string, string> | null;
}

export type EvolutionWebhookEvent =
  | "CONNECTION_UPDATE"
  | "QRCODE_UPDATED"
  | "MESSAGES_UPSERT"
  | "MESSAGES_UPDATE";

export interface EvolutionWebhookEnvelope {
  event?: string;
  instance?: string;
  data?: unknown;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

export type EvolutionErrorCode =
  | "FEATURE_DISABLED"
  | "MISSING_SECRET"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_5XX"
  | "UPSTREAM_4XX"
  | "INTERNAL_ERROR"
  | "DUPLICATE_EVENT"
  | "UNKNOWN_EVENT";

export interface EvolutionError {
  code: EvolutionErrorCode;
  message: string;
  status: number;
  details?: unknown;
}
