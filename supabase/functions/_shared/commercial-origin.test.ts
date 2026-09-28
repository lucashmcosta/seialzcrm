import { captureCommercialOrigin } from "./commercial-origin.ts";
const entry = {
  organizationId: "org-A",
  key: "form:lead-1",
  contactId: "contact-A",
  opportunityId: "opportunity-A",
  channel: "form",
  firstContactEntry: true,
  evidence: { gclid: "click-1" },
  occurredAt: "2026-09-25T12:00:00Z",
};
Deno.test("commercial ingress forwards the explicit organization and event identity without marketing writes", async () => {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ error: null });
    },
  };
  await captureCommercialOrigin(client, entry);
  const expected = [["commercial_capture", {
    p_org: "org-A",
    p_key: "form:lead-1",
    p_contact: "contact-A",
    p_opportunity: "opportunity-A",
    p_channel: "form",
    p_at: entry.occurredAt,
    p_first: true,
    p_verified: true,
    p_evidence: { gclid: "click-1" },
  }]];
  if (JSON.stringify(calls) !== JSON.stringify(expected)) {
    throw new Error("Ingress identity was not preserved");
  }
});
Deno.test("commercial errors never interrupt an existing lead/marketing flow", async () => {
  await captureCommercialOrigin({
    rpc: () => Promise.resolve({ error: { code: "42P01" } }),
  }, entry);
  await captureCommercialOrigin({
    rpc: () => Promise.reject(new Error("unavailable")),
  }, entry);
});
Deno.test("reused opportunities are not implicitly linked", async () => {
  let args: Record<string, unknown> = {};
  await captureCommercialOrigin({
    rpc: (_name: string, a: Record<string, unknown>) => {
      args = a;
      return Promise.resolve({ error: null });
    },
  }, { ...entry, opportunityId: null, firstContactEntry: false });
  if (args.p_opportunity !== null || args.p_first !== false) {
    throw new Error("Reused entity incorrectly attributed");
  }
});
