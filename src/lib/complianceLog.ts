// Log leve de compliance WhatsApp — grava tentativas bloqueadas em
// `public.compliance_blocks`. Nunca deve travar o envio: falha silenciosamente
// e apenas registra em console para diagnóstico.
//
// Eventos:
//   - template_blocked_7020_policy     → template proibido no endpoint LOW (7020)
//   - template_blocked_rate_limit      → já foi enviado 1 template na thread nas últimas 24h
//   - template_blocked_window_open     → MARKETING tentado com janela 24h/CTWA aberta
//   - template_blocked_low_quality     → regra genérica LOW (endpoint em modo LOW, sem template específico)
//
// Todos os campos exceto `organization_id` e `block_reason` são opcionais.

import { supabase } from '@/integrations/supabase/client';
import type { ServiceWindow } from './serviceWindow';

export type ComplianceBlockReason =
  | 'template_blocked_7020_policy'
  | 'template_blocked_rate_limit'
  | 'template_blocked_window_open'
  | 'template_blocked_low_quality';

export interface ComplianceBlockInput {
  organizationId: string | null | undefined;
  blockReason: ComplianceBlockReason;
  endpointId?: string | null;
  threadId?: string | null;
  contactId?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  attemptedByUserId?: string | null;
  sourceComponent?: string | null;
  window?: ServiceWindow | null;
  /** Metadados adicionais mesclados em `window_state` (ex.: last_template_sent_at). */
  extra?: Record<string, unknown> | null;
}

/**
 * Grava uma linha em `compliance_blocks`. Fail-open: erros são logados no
 * console e ignorados. Nunca aguardar isso para decidir se envia.
 */
export function logComplianceBlock(input: ComplianceBlockInput): void {
  if (!input.organizationId) {
    console.warn('[compliance-log] skipped: missing organization_id', input.blockReason);
    return;
  }
  const window_state = buildWindowState(input.window, input.extra);
  // Fire-and-forget. Nunca await, nunca throw.
  supabase
    .from('compliance_blocks')
    .insert({
      organization_id: input.organizationId,
      endpoint_id: input.endpointId ?? null,
      thread_id: input.threadId ?? null,
      contact_id: input.contactId ?? null,
      template_id: input.templateId ?? null,
      template_name: input.templateName ?? null,
      block_reason: input.blockReason,
      window_state,
      attempted_by_user_id: input.attemptedByUserId ?? null,
      source_component: input.sourceComponent ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('[compliance-log] insert failed (fail-open)', error.message);
    }, (e) => {
      console.warn('[compliance-log] insert threw (fail-open)', e);
    });
}

function buildWindowState(
  window: ServiceWindow | null | undefined,
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {};
  if (window) {
    base.origin_type = window.originType;
    base.is_open = window.isOpen;
    base.remaining_ms = window.remainingMs;
    base.is_ctwa_contact = window.isCtwaContact;
    base.expires_at = window.expiresAt;
    base.reason = window.reason;
  }
  if (extra) Object.assign(base, extra);
  return Object.keys(base).length ? base : null;
}
