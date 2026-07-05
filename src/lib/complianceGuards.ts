// Hotfix compliance WhatsApp — regras hardcoded para conter degradação de qualidade.
//
// Escopo curto: rodar hoje, sem migration. Revisitar em 7 dias.
//
// Fontes de verdade:
//   - Auditoria: docs/AUDITORIA_7020.md + docs/AUDITORIA_CTWA.md
//   - Templates: whatsapp_templates (query rodada em 2026-07-04)
//
// Se algum destes IDs mudar, atualize aqui + remova o hardcode assim que
// a coluna `communication_endpoints.quality_rating` estiver sincronizada
// com Meta e/ou o admin ganhar botão de "pausar template por endpoint".

import { supabase } from '@/integrations/supabase/client';

/** Endpoint 7020 — Central Trabalhista, Meta Cloud. */
export const ENDPOINT_7020_ID = '407ff93d-4860-49cd-82ae-beda456c1774';

/** Data (ISO) em que o hotfix começa a valer para o 7020. */
const HOTFIX_START = new Date('2026-07-04T00:00:00Z').getTime();
/** Duração do "modo LOW" antes da próxima revisão. */
const LOW_MODE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Endpoints tratados como qualidade LOW por tempo determinado.
 *
 * Semântica:
 *   - templates em `blockedTemplateIds` são bloqueados no seletor e no dispatch;
 *   - toda categoria MARKETING é bloqueada quando a janela de atendimento está aberta
 *     (regra genérica em qualquer endpoint, aplicada em `isMarketingBlocked`);
 *   - `allowedTemplateNamesHint` é só para mensagem amigável.
 */
export const LOW_QUALITY_ENDPOINTS: Record<string, {
  until: number;
  reason: string;
  blockedTemplateIds: string[];
  allowedTemplateNamesHint: string[];
}> = {
  [ENDPOINT_7020_ID]: {
    until: HOTFIX_START + LOW_MODE_DURATION_MS,
    reason: 'Número 7020 em qualidade LOW — templates de marketing suspensos por 7 dias.',
    // primeiro_contato + tentativa_de_contato (org Central Trabalhista)
    blockedTemplateIds: [
      '196de698-f956-4f1a-b4fb-3aa4cbd387d7', // primeiro_contato (MARKETING)
      'e0bfdf9a-2350-421a-85b1-9a1d032a2d45', // tentativa_de_contato (MARKETING)
    ],
    allowedTemplateNamesHint: ['conscentimento'],
  },
};

export function isEndpointLow(endpointId: string | null | undefined, now = Date.now()): boolean {
  if (!endpointId) return false;
  const cfg = LOW_QUALITY_ENDPOINTS[endpointId];
  return !!cfg && now < cfg.until;
}

export function getLowEndpointConfig(endpointId: string | null | undefined, now = Date.now()) {
  if (!endpointId) return null;
  const cfg = LOW_QUALITY_ENDPOINTS[endpointId];
  if (!cfg || now >= cfg.until) return null;
  return cfg;
}

/**
 * Bloqueia templates específicos para o endpoint (regra LOW).
 * Retorna motivo em pt-BR ou null se liberado.
 */
export function assertTemplateAllowedForEndpoint(
  templateId: string | null | undefined,
  endpointId: string | null | undefined,
): string | null {
  if (!templateId || !endpointId) return null;
  const cfg = getLowEndpointConfig(endpointId);
  if (!cfg) return null;
  if (cfg.blockedTemplateIds.includes(templateId)) {
    const allowed = cfg.allowedTemplateNamesHint.join(', ');
    return `Template bloqueado no endpoint (${cfg.reason}) Apenas: ${allowed}.`;
  }
  return null;
}

/**
 * Regra genérica: nunca disparar MARKETING enquanto a janela de atendimento
 * (24h ou CTWA 72h) estiver aberta — o correto é responder freeform.
 */
export function isMarketingBlockedWhenWindowOpen(
  category: string | null | undefined,
  windowIsOpen: boolean,
): boolean {
  if (!windowIsOpen) return false;
  if (!category) return false;
  return String(category).toUpperCase() === 'MARKETING';
}

/**
 * Regra reforçada p/ endpoints LOW (ex.: 7020): enquanto a janela WhatsApp
 * estiver aberta, bloquear TODOS os templates — inclusive UTILITY — para
 * proteger a qualidade do número. Fora da janela segue o fluxo normal
 * (allowed_purposes + rate limit + blockedTemplateIds).
 */
export const LOW_ENDPOINT_WINDOW_OPEN_MESSAGE =
  'Janela WhatsApp aberta. Use mensagem livre para proteger a qualidade do número.';

export function isLowEndpointWindowBlocked(
  endpointId: string | null | undefined,
  windowIsOpen: boolean,
  now = Date.now(),
): boolean {
  if (!windowIsOpen) return false;
  return isEndpointLow(endpointId, now);
}

// ------------------------- Rate limit: 1 template / contato / 24h -----------

export const TEMPLATE_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface TemplateRateLimitCheck {
  allowed: boolean;
  lastSentAt: string | null;
  reason: string | null;
}

/**
 * Bloqueia envio de qualquer template para a mesma thread (proxy do contato
 * dentro do canal WhatsApp) se um template já foi enviado nas últimas 24h.
 * Fail-open em erro do banco para não travar a UI em incidente.
 *
 * Observação: `messages` não tem `contact_id` (a chave de conversa é `thread_id`).
 * Como cada contato tem uma thread WhatsApp por endpoint, checar por thread já
 * cobre a regra "1 template / contato / 24h" no mesmo canal.
 */
export async function checkTemplateRateLimit(
  threadId: string | null | undefined,
  organizationId: string | null | undefined,
  now = Date.now(),
): Promise<TemplateRateLimitCheck> {
  if (!threadId || !organizationId) {
    return { allowed: true, lastSentAt: null, reason: null };
  }
  const since = new Date(now - TEMPLATE_RATE_LIMIT_WINDOW_MS).toISOString();
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('sent_at, template_id, thread_id, organization_id, direction')
      .eq('thread_id', threadId)
      .eq('organization_id', organizationId)
      .eq('direction', 'outbound')
      .not('template_id', 'is', null)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[compliance] rate-limit query failed, fail-open', error.message);
      return { allowed: true, lastSentAt: null, reason: null };
    }
    if (!data) return { allowed: true, lastSentAt: null, reason: null };
    return {
      allowed: false,
      lastSentAt: (data as any).sent_at ?? null,
      reason: 'Rate limit: já foi enviado 1 template nesta conversa nas últimas 24h.',
    };
  } catch (e) {
    console.warn('[compliance] rate-limit unexpected error, fail-open', e);
    return { allowed: true, lastSentAt: null, reason: null };
  }
}
