// Validates that the request was made with a valid service_role JWT for this project.
// More robust than string-matching against SUPABASE_SERVICE_ROLE_KEY env var,
// which can drift after Supabase key rotation.

export function validateServiceRoleAuth(req: Request): { ok: boolean; error?: string } {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Bearer token" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid JWT format" };
  }

  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    if (payload.role !== "service_role") {
      return { ok: false, error: `Invalid role: ${payload.role}` };
    }

    if (payload.iss !== "supabase") {
      return { ok: false, error: `Invalid issuer: ${payload.iss}` };
    }

    const projectRef = new URL(Deno.env.get("SUPABASE_URL")!).hostname.split(".")[0];
    if (payload.ref !== projectRef) {
      return { ok: false, error: `Invalid project ref: ${payload.ref}` };
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: "Token expired" };
    }

    return { ok: true };
  } catch (_e) {
    return { ok: false, error: "Invalid JWT payload" };
  }
}
