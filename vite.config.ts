import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const sentryEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

  // Release name: explicit SENTRY_RELEASE wins; otherwise derive a
  // deterministic build-time name (timestamp). Same value is:
  //   1. passed to sentryVitePlugin (creates the release + uploads maps)
  //   2. injected into the bundle so Sentry.init() tags events with it
  const release =
    process.env.SENTRY_RELEASE ||
    `seialz-crm@${new Date().toISOString().replace(/[:.]/g, "-")}`;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      __SENTRY_RELEASE__: JSON.stringify(release),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      sentryEnabled &&
        sentryVitePlugin({
          org: sentryOrg,
          project: sentryProject,
          authToken: sentryAuthToken,
          release: {
            name: release,
            // create release in Sentry and finalize after upload
            create: true,
            finalize: true,
            // associate the deploy with the current environment
            deploy: { env: mode === "production" ? "production" : mode },
          },
          sourcemaps: {
            // upload all built assets' source maps
            assets: ["./dist/**/*.js", "./dist/**/*.js.map"],
          },
          // surface upload errors in CI logs instead of swallowing them
          errorHandler: (err) => {
            // eslint-disable-next-line no-console
            console.error("[sentry-vite-plugin]", err);
          },
        }),
    ].filter(Boolean),
    build: {
      // "hidden" keeps source-map comments out of the public bundle but still
      // emits .map files so the Sentry plugin can upload them. When the
      // plugin is disabled we skip maps entirely to keep builds lean.
      sourcemap: sentryEnabled ? "hidden" : false,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    // Note: previously we had aggressive `manualChunks` here that split
    // radix/datepicker/icons/supabase/tanstack into separate chunks.
    // That triggered a production-only TDZ ("Cannot access 'X' before
    // initialization") because Rollup hoisted module init across chunks.
    // Letting Vite/Rollup decide chunking automatically is the safe default.
  };
});
