// Centralized authorization rule for the Inbox composer.
//
// Two independent gating paths coexist:
//
// 1) Service-endpoint path (Atendimento inbound):
//    endpoint.purpose == 'customer_service'
//    && business_context == 'customer_service'
//    && thread.status == 'open'
//    && isIn24hWindow == true
//    → allow (lifecycle_stage / cs flag / routing action are IGNORED).
//
// 2) Legacy Inbox path (pre-endpoint model):
//    contact.lifecycle_stage == 'customer', OR
//    (org.cs_inbox_includes_service_endpoints && endpoint.purpose == 'customer_service'), OR
//    last_routing_decision.action == 'inbox_manual_start' && purpose ∈ {customer_service, other}
//    → allow.
//
// The 24h window still gates FREE-TEXT sending (templates remain the escape hatch)
// — that is enforced elsewhere in the composer; this helper only decides whether
// the composer surface is enabled at all.

export type InboxReplyDecision =
  | { allowed: true; reason: 'service_endpoint' | 'customer_lifecycle' | 'org_service_flag' | 'manual_start' }
  | { allowed: false; reason: 'commercial_endpoint' | 'thread_closed' | 'not_customer' };

export interface CanReplyInput {
  endpointPurpose: string | null | undefined;
  businessContext: string | null | undefined;
  lifecycleStage: string | null | undefined;
  isIn24hWindow: boolean;
  threadStatus: string | null | undefined;
  orgSettings: { cs_inbox_includes_service_endpoints?: boolean | null } | null | undefined;
  routingDecision: { action?: string | null } | null | undefined;
}

export function canReplyInInbox(input: CanReplyInput): InboxReplyDecision {
  const {
    endpointPurpose,
    businessContext,
    lifecycleStage,
    isIn24hWindow,
    threadStatus,
    orgSettings,
    routingDecision,
  } = input;

  // Hard blocks that apply regardless of the path.
  if (endpointPurpose === 'commercial' || endpointPurpose === 'vendor_personal') {
    return { allowed: false, reason: 'commercial_endpoint' };
  }
  if (threadStatus === 'resolved' || threadStatus === 'closed') {
    return { allowed: false, reason: 'thread_closed' };
  }

  // Path 1 — Service endpoint inbound within 24h window.
  // Purpose + business_context + open status + 24h open is enough on its own.
  if (
    endpointPurpose === 'customer_service' &&
    businessContext === 'customer_service' &&
    threadStatus === 'open' &&
    isIn24hWindow
  ) {
    return { allowed: true, reason: 'service_endpoint' };
  }

  // Path 2 — Legacy Inbox rules (preserved for backwards compatibility).
  if (lifecycleStage === 'customer') {
    return { allowed: true, reason: 'customer_lifecycle' };
  }
  if (
    orgSettings?.cs_inbox_includes_service_endpoints &&
    endpointPurpose === 'customer_service'
  ) {
    return { allowed: true, reason: 'org_service_flag' };
  }
  if (
    routingDecision?.action === 'inbox_manual_start' &&
    (endpointPurpose === 'customer_service' || endpointPurpose === 'other')
  ) {
    return { allowed: true, reason: 'manual_start' };
  }

  return { allowed: false, reason: 'not_customer' };
}
