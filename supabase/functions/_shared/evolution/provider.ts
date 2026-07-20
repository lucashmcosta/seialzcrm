// Evolution API — Camada de abstração do provider.
//
// Objetivo: isolar o restante do sistema dos detalhes da Evolution.
// Nenhum caller produtivo consome este módulo enquanto a feature flag
// `evolution_api_enabled` estiver desligada.
//
// A superfície pública descreve o CONTRATO que o dispatcher / composer /
// UI passarão a consumir em fases futuras. Não altera Meta nem Twilio.

import {
  EvolutionConnectionState,
  EvolutionCreateInstanceResult,
  EvolutionError,
  EvolutionInstanceSummary,
  EvolutionQrCode,
  EvolutionWebhookConfig,
} from "./types.ts";
import {
  evolutionConnect,
  evolutionConnectionState,
  evolutionCreateInstance,
  evolutionDeleteInstance,
  evolutionFetchInstances,
  evolutionLogout,
  evolutionWebhookFind,
  evolutionWebhookSet,
  EvolutionEnv,
} from "./client.ts";

export interface EvolutionProvider {
  create(
    input: { instanceName: string; qrcode?: boolean },
  ): Promise<EvolutionCreateInstanceResult | EvolutionError>;
  delete(instanceName: string): Promise<true | EvolutionError>;
  logout(instanceName: string): Promise<true | EvolutionError>;
  connect(instanceName: string): Promise<EvolutionQrCode | EvolutionError>;
  connectionState(
    instanceName: string,
  ): Promise<EvolutionConnectionState | EvolutionError>;
  fetch(
    instanceName?: string,
  ): Promise<EvolutionInstanceSummary[] | EvolutionError>;
  webhookFind(
    instanceName: string,
  ): Promise<EvolutionWebhookConfig | null | EvolutionError>;
  webhookSet(
    instanceName: string,
    cfg: EvolutionWebhookConfig,
  ): Promise<true | EvolutionError>;
}

export function makeEvolutionProvider(
  env: EvolutionEnv,
  requestId?: string,
): EvolutionProvider {
  return {
    async create(input) {
      const r = await evolutionCreateInstance(env, input, requestId);
      return r.ok ? r.data : r.error;
    },
    async delete(instanceName) {
      const r = await evolutionDeleteInstance(env, instanceName, requestId);
      return r.ok ? true : r.error;
    },
    async logout(instanceName) {
      const r = await evolutionLogout(env, instanceName, requestId);
      return r.ok ? true : r.error;
    },
    async connect(instanceName) {
      const r = await evolutionConnect(env, instanceName, requestId);
      return r.ok ? r.data : r.error;
    },
    async connectionState(instanceName) {
      const r = await evolutionConnectionState(env, instanceName, requestId);
      return r.ok ? (r.data.instance?.state ?? "unknown") : r.error;
    },
    async fetch(instanceName) {
      const r = await evolutionFetchInstances(env, instanceName, requestId);
      return r.ok ? r.data : r.error;
    },
    async webhookFind(instanceName) {
      const r = await evolutionWebhookFind(env, instanceName, requestId);
      return r.ok ? r.data : r.error;
    },
    async webhookSet(instanceName, cfg) {
      const r = await evolutionWebhookSet(env, instanceName, cfg, requestId);
      return r.ok ? true : r.error;
    },
  };
}
