import { useEffect, useState } from "react";

declare const __SENTRY_RELEASE__: string;

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

/**
 * Internal diagnostic dashboard for engineers.
 * Pulls the same payload as /health (edge function) and renders it readably,
 * plus the frontend-side context (build release, Sentry DSN presence).
 */
export default function DevHealth() {
  const [remote, setRemote] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const release =
    typeof __SENTRY_RELEASE__ !== "undefined" ? __SENTRY_RELEASE__ : "seialz-crm@dev";
  const sentryDsn =
    (import.meta.env.VITE_SENTRY_DSN as string | undefined) ??
    "https://4c1f6fa2b1b8ecf9811ac1c34bc51833@o4510769203118080.ingest.us.sentry.io/4511604734164992";

  const frontend = {
    frontend: "ok",
    release,
    sentryEnabled: Boolean(sentryDsn),
    environment: import.meta.env.MODE,
    timestamp: new Date().toISOString(),
  };

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(HEALTH_URL, {
        cache: "no-store",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });

      const json = (await res.json()) as HealthPayload;
      setRemote(json);
    } catch (e) {
      setError((e as Error).message);
      setRemote(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dev Health</h1>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-sm font-mono px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted disabled:opacity-50"
          >
            {loading ? "..." : "refresh"}
          </button>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wide">
            Frontend
          </h2>
          <div className="rounded-lg border border-border bg-card">
            <dl className="divide-y divide-border">
              {Object.entries(frontend).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="font-mono text-sm text-muted-foreground">{key}</dt>
                  <dd className="font-mono text-sm">
                    {typeof value === "boolean" ? (
                      <span className={value ? "text-green-500 font-semibold" : "text-red-500 font-semibold"}>
                        {String(value)}
                      </span>
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wide">
            Backend ({HEALTH_URL})
          </h2>
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-600">
              error: {error}
            </div>
          )}
          {remote && (
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="font-mono text-sm text-muted-foreground">status</span>
                <span
                  className={
                    remote.status === "ok"
                      ? "text-green-500 font-mono text-sm font-semibold"
                      : "text-red-500 font-mono text-sm font-semibold"
                  }
                >
                  {remote.status}
                </span>
              </div>
              <dl className="divide-y divide-border">
                <Row k="release" v={remote.release} />
                <Row k="environment" v={remote.environment} />
                <Row k="timestamp" v={remote.timestamp} />
                {Object.entries(remote.checks).map(([k, v]) => (
                  <Row key={k} k={`checks.${k}`} v={v} />
                ))}
              </dl>
            </div>
          )}
        </section>

        <pre className="text-xs font-mono bg-muted text-muted-foreground rounded-lg p-4 overflow-x-auto">
{JSON.stringify({ frontend, backend: remote, error }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="font-mono text-sm text-muted-foreground">{k}</dt>
      <dd className="font-mono text-sm">
        {typeof v === "boolean" ? (
          <span className={v ? "text-green-500 font-semibold" : "text-red-500 font-semibold"}>
            {String(v)}
          </span>
        ) : (
          String(v)
        )}
      </dd>
    </div>
  );
}
