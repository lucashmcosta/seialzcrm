import { useMemo } from "react";

declare const __SENTRY_RELEASE__: string;

/**
 * Internal diagnostic page for engineers.
 * Shows frontend status, release/version, Sentry config, environment, timestamp.
 */
export default function DevHealth() {
  const data = useMemo(() => {
    const release =
      typeof __SENTRY_RELEASE__ !== "undefined" ? __SENTRY_RELEASE__ : "seialz-crm@dev";
    const sentryDsn =
      (import.meta.env.VITE_SENTRY_DSN as string | undefined) ??
      "https://4c1f6fa2b1b8ecf9811ac1c34bc51833@o4510769203118080.ingest.us.sentry.io/4511604734164992";

    return {
      frontend: "ok",
      release,
      sentryEnabled: Boolean(sentryDsn),
      environment: import.meta.env.MODE,
      timestamp: new Date().toISOString(),
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Dev Health</h1>

        <div className="rounded-lg border border-border bg-card">
          <dl className="divide-y divide-border">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <dt className="font-mono text-sm text-muted-foreground">{key}</dt>
                <dd className="font-mono text-sm">
                  {typeof value === "boolean" ? (
                    <span
                      className={
                        value ? "text-green-500 font-semibold" : "text-red-500 font-semibold"
                      }
                    >
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

        <pre className="text-xs font-mono bg-muted text-muted-foreground rounded-lg p-4 overflow-x-auto">
{JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
