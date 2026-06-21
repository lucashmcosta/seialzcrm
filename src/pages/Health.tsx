import { useEffect } from "react";

/**
 * Public health endpoint for Better Stack / Uptime monitors.
 *
 * LIMITATION: This is a frontend-only Vite SPA hosted by Lovable — there is no
 * server route to return a real JSON response with proper Content-Type headers.
 * Monitors should be configured with:
 *   - Method: GET
 *   - Expected status: 200
 *   - Expected body keyword: "ok"
 *
 * The page renders the literal string "ok" as the first/only visible content
 * and exposes a machine-readable payload via a <script type="application/json">
 * tag with id="health-payload" for monitors that can parse the DOM.
 */
export default function Health() {
  const payload = {
    status: "ok",
    app: "seialz-crm",
    environment: import.meta.env.MODE,
    timestamp: new Date().toISOString(),
  };

  useEffect(() => {
    document.title = "ok";
  }, []);

  return (
    <>
      <pre
        id="health-status"
        style={{
          margin: 0,
          padding: "1rem",
          fontFamily: "monospace",
          fontSize: "14px",
        }}
      >
        ok
      </pre>
      <script
        type="application/json"
        id="health-payload"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
      />
    </>
  );
}
