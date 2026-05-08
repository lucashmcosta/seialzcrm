// Tipos compartilhados do sistema de handlers de integração.

export enum Classification {
  Success = "success",
  Conflict = "conflict",
  Retryable = "retryable",
  Permanent = "permanent",
}

export interface IntegrationJob {
  id: string;
  organization_id: string;
  event_id: string;
  subscription_id: string;
  integration_slug: string;
  target_action: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  external_response: Record<string, unknown> | null;
  created_at: string;
}

export interface IntegrationSubscription {
  id: string;
  organization_id: string;
  integration_id: string | null;
  integration_slug: string;
  event_type: string;
  target_action: string;
  config: Record<string, unknown>;
  is_active: boolean;
  paused_until: string | null;
}

export interface IntegrationEvent {
  id: string;
  organization_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface HandlerContext {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  job: IntegrationJob;
  subscription: IntegrationSubscription;
  event: IntegrationEvent;
}

export interface HandlerResult {
  classification: Classification;
  /** ID do recurso no sistema externo (necessário para Success). */
  externalId?: string;
  /** Tipo de entidade local mapeada (ex: 'contact', 'opportunity', 'message'). */
  entityType?: string;
  /** ID da entidade local. Default: event.entity_id. */
  internalId?: string;
  /** Payload bruto retornado pelo sistema externo (gravado em external_response e external_metadata). */
  externalPayload?: Record<string, unknown>;
  /** Mensagem de erro (Retryable / Permanent). */
  error?: string;
  /** HTTP status para auditoria. */
  httpStatus?: number;
  /** Duração da chamada externa em ms (para auditoria). */
  durationMs?: number;
}

export type Handler = (ctx: HandlerContext) => Promise<HandlerResult>;
