// Formato "Conversions API for Business Messaging" (eventos de conversa no WhatsApp).
// Doc: developers.facebook.com/docs/marketing-api/conversions-api/business-messaging
//   * action_source = "business_messaging", messaging_channel = "whatsapp"
//   * user_data.whatsapp_business_account_id sempre; user_data.ctwa_clid quando houver
//   * sem ctwa_clid: user_data.page_id é obrigatório + ao menos em/ph com hash
//   * "Lead" não é aceito nesse canal (o equivalente é LeadSubmitted)
//   * a Meta não remove duplicados nesse canal: a dedup é nossa (1 por oportunidade e tipo)
// Funções puras, testadas em messaging.test.ts.

export const MESSAGING_EVENTS = new Set([
  "LeadSubmitted", "QualifiedLead", "Purchase", "InitiateCheckout", "AddToCart", "ViewContent",
  "OrderCreated", "OrderShipped", "OrderDelivered", "OrderCanceled", "OrderReturned",
  "CartAbandoned", "RatingProvided", "ReviewProvided",
]);

// Só dados de cliente com hash (a doc ignora external_id; fbc/lead_id/IP/UA não se aplicam).
const HASHED_KEYS = ["em", "ph", "fn", "ln", "ct", "st", "zp", "country"] as const;

export type MessagingUserData =
  | { ok: true; userData: Record<string, unknown>; matchedBy: "ctwa_clid" | "page_id" }
  | { ok: false; reason: "missing_waba" | "missing_page_id" | "missing_customer_data" };

export function buildMessagingUserData(
  base: Record<string, unknown>,
  ids: { wabaId: string | null; ctwaClid: string | null; pageId: string | null },
): MessagingUserData {
  if (!ids.wabaId) return { ok: false, reason: "missing_waba" };
  const ud: Record<string, unknown> = {};
  for (const k of HASHED_KEYS) if (base[k] !== undefined) ud[k] = base[k];
  ud.whatsapp_business_account_id = ids.wabaId;
  // A página vai sempre que existir: nos testes de 17/11 só os eventos com page_id
  // apareceram no Gerenciador de Eventos; com ctwa_clid sozinho a Meta aceitava e não mostrava.
  if (ids.pageId) ud.page_id = ids.pageId;
  if (ids.ctwaClid) {
    ud.ctwa_clid = ids.ctwaClid;
    return { ok: true, userData: ud, matchedBy: "ctwa_clid" };
  }
  if (!ids.pageId) return { ok: false, reason: "missing_page_id" };
  if (ud.em === undefined && ud.ph === undefined) return { ok: false, reason: "missing_customer_data" };
  return { ok: true, userData: ud, matchedBy: "page_id" };
}

export interface CapiRule {
  trigger_type: "stage_entered" | "won";
  event_name: string;
  value_mode: "none" | "fixed" | "amount";
  fixed_value: number | string | null;
  currency: string | null;
}

/** custom_data só com valor e moeda — nada que identifique a pessoa ou o caso. */
export function buildMessagingCustomData(
  rule: CapiRule | null,
  opportunityAmount: number | string | null | undefined,
): Record<string, unknown> | null {
  if (!rule || rule.value_mode === "none") return null;
  const raw = rule.value_mode === "fixed" ? rule.fixed_value : opportunityAmount;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return { currency: (rule.currency || "BRL").toUpperCase(), value };
}

/** Escolhe a regra do evento: no ganho, prefere a regra 'won'. */
export function pickRule(rules: CapiRule[], eventName: string, opportunityWon: boolean): CapiRule | null {
  const same = rules.filter((r) => r.event_name === eventName);
  if (same.length === 0) return null;
  const preferred = same.find((r) => r.trigger_type === (opportunityWon ? "won" : "stage_entered"));
  return preferred ?? same[0];
}

/** Um único valor entre os candidatos (deduplicado), senão null. */
export function singleValue(values: Array<string | null | undefined>): string | null {
  const set = new Set(values.filter((v): v is string => !!v && String(v).trim() !== "").map(String));
  return set.size === 1 ? [...set][0] : null;
}
