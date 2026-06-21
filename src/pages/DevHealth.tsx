import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

declare const __SENTRY_RELEASE__: string;

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://qvmtzfvkhkhkhdpclzua.supabase.co";
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
  const [transport, setTransport] = useState<string>("supabase.functions.invoke");

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
      const { data, error: invokeError } = await supabase.functions.invoke<HealthPayload>("health", {
        method: "GET",
      });

      if (invokeError) throw invokeError;
      setRemote(data);
      setTransport("supabase.functions.invoke");
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
                <span className="font-mono text-sm text-muted-foreground">backend</span>
                <span
                  className={
                    remote.status === "ok"
                      ? "text-success font-mono text-sm font-semibold"
                      : "text-destructive font-mono text-sm font-semibold"
                  }
                >
                  {remote.status === "ok" ? "ok" : "degraded"}
                </span>
              </div>
              <dl className="divide-y divide-border">
                <Row k="status" v={remote.status} />
                <Row k="transport" v={transport} />
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
{JSON.stringify({ frontend, backend: remote, transport, error }, null, 2)}
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
          <span className={v ? "text-success font-semibold" : "text-destructive font-semibold"}>
            {String(v)}
          </span>
        ) : (
          String(v)
        )}
      </dd>
    </div>
  );
}
