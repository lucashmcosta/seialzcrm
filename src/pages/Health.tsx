import { useEffect, useState } from "react";

/**
 * Public health endpoint surface for monitoring (Better Stack / UptimeRobot).
 *
 * Canonical monitoring URL is the Supabase edge function:
 *   https://<project>.supabase.co/functions/v1/health
 * It returns structured JSON with proper Content-Type and HTTP 200/503.
 *
 * This SPA page mirrors the same payload so monitors hitting /health on the
 * web app domain still get a readable response. It:
 *   - Fetches the edge function payload
 *   - Renders the raw JSON as the page body
 *   - Exposes <script type="application/json" id="health-payload"> for parsers
 *   - Sets document.title to "ok" or "degraded"
 *
 * Note: a SPA cannot return non-200 HTTP. For real status-code-based alerts,
 * point the monitor at the edge function URL.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://qvmtzfvkhkhkhdpclzua.supabase.co";
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE";
const HEALTH_URL = `${SUPABASE_URL}/functions/v1/health`;


type HealthPayload = {
  status: string;
  app: string;
  release: string;
  environment: string;
  timestamp: string;
  checks: Record<string, unknown>;
};

export default function Health() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(HEALTH_URL, {
          cache: "no-store",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });

        const json = (await res.json()) as HealthPayload;
        if (cancelled) return;
        setPayload(json);
        document.title = json.status === "ok" ? "ok" : json.status;
      } catch (e) {
        if (cancelled) return;
        const fallback: HealthPayload = {
          status: "degraded",
          app: "seialz-crm",
          release: "unknown",
          environment: import.meta.env.MODE,
          timestamp: new Date().toISOString(),
          checks: { frontend: "ok", health_endpoint: `error: ${(e as Error).message}` },
        };
        setPayload(fallback);
        setError((e as Error).message);
        document.title = "degraded";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const text = payload ? JSON.stringify(payload, null, 2) : "loading";

  return (
    <>
      <pre
        id="health-status"
        style={{
          margin: 0,
          padding: "1rem",
          fontFamily: "monospace",
          fontSize: "13px",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </pre>
      {payload && (
        <script
          type="application/json"
          id="health-payload"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
        />
      )}
      {error && (
        <script
          type="application/json"
          id="health-error"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({ error }) }}
        />
      )}
    </>
  );
}
