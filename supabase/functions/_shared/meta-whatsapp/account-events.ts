// Eventos de CONTA do webhook WhatsApp Cloud (account_update, qualidade do número,
// qualidade/status de template...). Diferente de mensagens e status, eles não
// trazem value.metadata.phone_number_id — só entry.id (a WABA). Sem tratamento
// próprio o webhook recusava todos com 401 e o aviso da Meta se perdia
// (queda de qualidade e restrição de conta sem nenhum registro).

/** WABAs (entry.id) que têm pelo menos uma mudança sem phone_number_id. */
export function accountEventWabaIds(payload: any): string[] {
  const ids = new Set<string>();
  for (const entry of payload?.entry ?? []) {
    const hasAccountChange = (entry?.changes ?? []).some(
      (c: any) => !c?.value?.metadata?.phone_number_id,
    );
    const id = entry?.id != null ? String(entry.id) : "";
    if (hasAccountChange && /^\d+$/.test(id)) ids.add(id);
  }
  return [...ids];
}

export interface AccountEventSummary {
  /** Merece aviso imediato para os administradores da org. */
  critical: boolean;
  /** Boa notícia que também vale avisar (conta reativada). */
  good_news?: boolean;
  title: string;
  body: string;
}

const s = (v: unknown) => (v == null ? "" : String(v));

/** Traduz o evento em texto para a notificação. Campos desconhecidos viram registro sem aviso. */
export function describeAccountEvent(field: string, value: any): AccountEventSummary {
  const v = value ?? {};
  switch (field) {
    case "account_update": {
      const event = s(v.event).toUpperCase();
      if (event === "DISABLED_UPDATE" && s(v.ban_info?.waba_ban_state).toUpperCase() === "REINSTATE") {
        return {
          critical: false,
          good_news: true,
          title: "WhatsApp: a Meta reativou a conta",
          body: "A conta do WhatsApp foi reativada pela Meta e pode voltar a enviar mensagens.",
        };
      }
      const critical = /VIOLATION|RESTRICT|DISABLE|BAN|LOCK/.test(event);
      const violation = s(v.violation_info?.violation_type);
      const restrictions = Array.isArray(v.restriction_info)
        ? v.restriction_info
          .map((r: any) => [s(r?.restriction_type), r?.expiration ? `previsão da Meta: até ${new Date(Number(r.expiration) * 1000).toISOString().slice(0, 10)}, pode mudar com o recurso` : ""].filter(Boolean).join(" "))
          .filter(Boolean)
          .join("; ")
        : "";
      const detail = [violation && `motivo: ${violation}`, restrictions && `restrição: ${restrictions}`]
        .filter(Boolean).join(" · ");
      return {
        critical,
        title: critical ? "WhatsApp: a Meta aplicou uma restrição na conta" : "WhatsApp: atualização da conta",
        body: `Evento ${event || "desconhecido"}${detail ? ` (${detail})` : ""}. Veja os detalhes no Business Support Home da Meta.`,
      };
    }
    case "phone_number_quality_update": {
      const event = s(v.event).toUpperCase();
      const critical = event === "FLAGGED" || event === "DOWNGRADE";
      const phone = s(v.display_phone_number);
      const limit = s(v.current_limit);
      return {
        critical,
        title: critical ? "WhatsApp: a qualidade do número caiu" : "WhatsApp: qualidade do número atualizada",
        body: `${phone ? `Número ${phone}: ` : ""}${event || "atualização"}${limit ? ` (limite atual ${limit})` : ""}. Muitas pessoas bloqueando ou denunciando derrubam a qualidade e podem levar à restrição da conta.`,
      };
    }
    case "message_template_quality_update": {
      const score = s(v.new_quality_score).toUpperCase();
      const critical = score === "RED" || score === "YELLOW";
      return {
        critical,
        title: critical ? "WhatsApp: template com qualidade baixa" : "WhatsApp: qualidade de template atualizada",
        body: `Template ${s(v.message_template_name) || s(v.message_template_id)}: qualidade ${s(v.previous_quality_score) || "?"} → ${score || "?"}.`,
      };
    }
    case "message_template_status_update": {
      const event = s(v.event).toUpperCase();
      const critical = event === "PAUSED" || event === "DISABLED" || event === "FLAGGED";
      const reason = s(v.reason) && s(v.reason) !== "NONE" ? ` (motivo: ${s(v.reason)})` : "";
      return {
        critical,
        title: critical ? "WhatsApp: template pausado ou desativado pela Meta" : "WhatsApp: status de template atualizado",
        body: `Template ${s(v.message_template_name) || s(v.message_template_id)}: ${event || "atualização"}${reason}.`,
      };
    }
    default:
      return { critical: false, title: `WhatsApp: evento ${field}`, body: "" };
  }
}
