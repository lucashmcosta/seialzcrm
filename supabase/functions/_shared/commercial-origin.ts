/** Best-effort additive capture: this function never mutates marketing or blocks ingress. */
export async function captureCommercialOrigin(client: any, entry: {
  organizationId: string;
  key: string;
  contactId: string;
  opportunityId?: string | null;
  channel: string;
  firstContactEntry: boolean;
  occurredAt?: string;
  evidence: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await client.rpc("commercial_capture", {
      p_org: entry.organizationId,
      p_key: entry.key,
      p_contact: entry.contactId,
      p_opportunity: entry.opportunityId ?? null,
      p_channel: entry.channel,
      p_at: entry.occurredAt ?? new Date().toISOString(),
      p_first: entry.firstContactEntry,
      p_verified: true,
      p_evidence: entry.evidence,
    });
    if (error) {
      console.error("[commercial-origin] capture failed", {
        key: entry.key,
        code: error.code,
      });
    }
  } catch (error) {
    console.error("[commercial-origin] capture exception", {
      key: entry.key,
      error: String(error),
    });
  }
}
