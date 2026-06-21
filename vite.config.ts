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

  // Release name resolution (priority):
  //   1. SENTRY_RELEASE (if set and not an unexpanded "$VAR" literal)
  //   2. seialz-crm@<VERCEL_GIT_COMMIT_SHA>
  //   3. seialz-crm@<VERCEL_GIT_COMMIT_REF>-<timestamp>
  //   4. seialz-crm@<timestamp>
  // Same value is passed to sentryVitePlugin, injected into the bundle via
  // __SENTRY_RELEASE__, and used by Sentry.init() at runtime.
  const explicitRelease = process.env.SENTRY_RELEASE;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let release: string;
  if (explicitRelease && !explicitRelease.includes("$")) {
    release = explicitRelease;
  } else if (process.env.VERCEL_GIT_COMMIT_SHA) {
    release = `seialz-crm@${process.env.VERCEL_GIT_COMMIT_SHA}`;
  } else if (process.env.VERCEL_GIT_COMMIT_REF) {
    release = `seialz-crm@${process.env.VERCEL_GIT_COMMIT_REF}-${timestamp}`;
  } else {
    release = `seialz-crm@${timestamp}`;
  }
  // eslint-disable-next-line no-console
  console.log("[sentry] release:", release);

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
