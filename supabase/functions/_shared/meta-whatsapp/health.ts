// Situação de um número WhatsApp Cloud, lida da Graph API pela rotina meta-wa-health-check.
// Complementa o webhook de eventos de conta: se um aviso da Meta se perder, a consulta
// periódica ainda encontra a mudança. Sem dependências de Deno (testável).

export type CanSend = "AVAILABLE" | "LIMITED" | "BLOCKED";

export interface HealthError {
  entity_type: string | null;
  error_code: number | null;
  error_description: string | null;
  possible_solution: string | null;
}

export interface WaHealth {
  quality_rating: string | null;        // GREEN | YELLOW | RED | UNKNOWN
  phone_status: string | null;          // CONNECTED | FLAGGED | RESTRICTED | ...
  messaging_limit_tier: string | null;  // TIER_250 | TIER_2K | ...
  can_send_message: CanSend | null;
  health_errors: HealthError[];
}

const up = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

/** Junta o GET do número (/{phone_id}) e o health_status da WABA (/{waba_id}?fields=health_status). */
export function summarizeHealth(phone: any, healthStatus: any): WaHealth {
  const canSend = up(healthStatus?.can_send_message);
  const errors: HealthError[] = [];
  for (const entity of Array.isArray(healthStatus?.entities) ? healthStatus.entities : []) {
    for (const e of Array.isArray(entity?.errors) ? entity.errors : []) {
      errors.push({
        entity_type: str(entity?.entity_type),
        error_code: Number.isFinite(Number(e?.error_code)) ? Number(e.error_code) : null,
        error_description: str(e?.error_description),
        possible_solution: str(e?.possible_solution),
      });
    }
  }
  return {
    quality_rating: up(phone?.quality_rating),
    phone_status: up(phone?.status),
    messaging_limit_tier: up(phone?.messaging_limit_tier),
    can_send_message: canSend === "AVAILABLE" || canSend === "LIMITED" || canSend === "BLOCKED" ? canSend : null,
    health_errors: errors,
  };
}

const SEND_RANK: Record<string, number> = { AVAILABLE: 0, LIMITED: 1, BLOCKED: 2 };
const QUALITY_RANK: Record<string, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

export interface HealthAlert {
  kind: "worse" | "better";
  title: string;
  body: string;
}

const SEND_LABEL: Record<string, string> = { AVAILABLE: "liberado", LIMITED: "limitado", BLOCKED: "bloqueado" };
const QUALITY_LABEL: Record<string, string> = { GREEN: "alta", YELLOW: "média", RED: "baixa" };

/**
 * Aviso para os administradores quando a situação muda. Sem estado anterior (primeira
 * verificação), só avisa se já estiver ruim. Mudança para UNKNOWN ou falta de dado não avisa.
 */
export function healthAlert(prev: Partial<WaHealth> | null | undefined, next: WaHealth, phoneLabel = ""): HealthAlert | null {
  const who = phoneLabel ? `Número ${phoneLabel}: ` : "";
  const detail = next.health_errors.map((e) => e.error_description).filter(Boolean).slice(0, 2).join(" ");

  const sPrev = prev?.can_send_message ? SEND_RANK[prev.can_send_message] : undefined;
  const sNext = next.can_send_message ? SEND_RANK[next.can_send_message] : undefined;
  if (sNext !== undefined && sNext > (sPrev ?? 0)) {
    return {
      kind: "worse",
      title: next.can_send_message === "BLOCKED" ? "WhatsApp: a Meta bloqueou o envio" : "WhatsApp: a Meta limitou o envio",
      body: `${who}envio ${SEND_LABEL[next.can_send_message!]}.${detail ? ` ${detail}` : ""} Veja os detalhes no Business Support Home da Meta.`,
    };
  }

  const qPrev = prev?.quality_rating ? QUALITY_RANK[prev.quality_rating] : undefined;
  const qNext = next.quality_rating ? QUALITY_RANK[next.quality_rating] : undefined;
  if (qNext !== undefined && qNext > (qPrev ?? 0)) {
    return {
      kind: "worse",
      title: "WhatsApp: a qualidade do número caiu",
      body: `${who}qualidade ${QUALITY_LABEL[next.quality_rating!]}. Muita gente bloqueando ou denunciando derruba a qualidade e pode levar à restrição da conta.`,
    };
  }

  if (sPrev !== undefined && sNext !== undefined && sNext < sPrev && next.can_send_message === "AVAILABLE") {
    return { kind: "better", title: "WhatsApp: envio liberado de novo", body: `${who}a Meta liberou o envio.` };
  }
  if (qPrev !== undefined && qNext !== undefined && qNext < qPrev) {
    return { kind: "better", title: "WhatsApp: a qualidade do número melhorou", body: `${who}qualidade ${QUALITY_LABEL[next.quality_rating!]}.` };
  }
  return null;
}
