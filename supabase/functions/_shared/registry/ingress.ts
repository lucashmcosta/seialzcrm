type IngressIdentity =
  | {
      ok: true;
      country: "BR" | "US";
      fullName: string;
      firstName: string | null;
      lastName: string | null;
    }
  | { ok: false; reason: string };

async function externalIdHash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "contact-ingress";
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function resolveContactIngressIdentity(
  // Different Edge Functions in this repository currently import Supabase
  // from npm and JSR. Keep this adapter structural until those imports converge.
  // deno-lint-ignore no-explicit-any
  service: any,
  input: {
    organizationId: string;
    source: string;
    externalId: string;
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    safePayload?: Record<string, unknown>;
  },
): Promise<IngressIdentity> {
  const { data: organization } = await service
    .from("organizations")
    .select("operating_country_code")
    .eq("id", input.organizationId)
    .maybeSingle();
  const country = organization?.operating_country_code as "BR" | "US" | null;
  const fullName = String(input.fullName ?? "").replace(/\s+/g, " ").trim();
  const firstName = String(input.firstName ?? "").replace(/\s+/g, " ").trim() || null;
  const lastName = String(input.lastName ?? "").replace(/\s+/g, " ").trim() || null;
  const reason = !country
    ? "operating_country_required"
    : country === "US" && (!firstName || !lastName)
    ? "name_parts_required"
    : country === "BR" && !fullName
    ? "full_name_required"
    : null;

  if (!reason && country) {
    return {
      ok: true,
      country,
      fullName: country === "US" ? `${firstName} ${lastName}` : fullName,
      firstName,
      lastName,
    };
  }

  const externalId = await externalIdHash(input.externalId);
  const { data: openFailure } = await service
    .from("contact_ingress_failures")
    .select("id, attempt_count")
    .eq("organization_id", input.organizationId)
    .eq("source", input.source)
    .eq("external_id", externalId)
    .eq("reason", reason!)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  const payload = {
    ...(input.safePayload ?? {}),
    full_name: fullName || null,
    first_name: firstName,
    last_name: lastName,
  };
  if (openFailure) {
    await service.from("contact_ingress_failures").update({
      payload,
      attempt_count: Number(openFailure.attempt_count ?? 1) + 1,
      last_error_code: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", openFailure.id);
  } else {
    await service.from("contact_ingress_failures").insert({
      organization_id: input.organizationId,
      source: input.source,
      external_id: externalId,
      reason,
      payload,
      last_error_code: reason,
    });
  }
  return { ok: false, reason: reason! };
}
