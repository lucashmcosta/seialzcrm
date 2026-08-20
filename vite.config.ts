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
      rollupOptions: {
        output: {
          // Quebra o bundle de entrada (era ~1.6s de parse/execução na home,
          // gerando um long animation frame de 2.7s detectado pelo Sentry)
          // em chunks paralelos e cacheáveis entre deploys.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
              return "vendor-react";
            }
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@sentry")) return "vendor-sentry";
            if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) {
              return "vendor-motion";
            }
            return undefined;
          },
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    // Pre-bundle the React-dependent libraries up front. Without this, Vite
    // discovers some of them lazily and re-runs the dep optimizer mid-session;
    // an open tab then mixes chunks from two generations (different `?v=`
    // hashes), a library grabs a second React copy and hooks explode with
    // "Cannot read properties of null (reading 'useRef')". Dev-only concern.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react-router-dom",
        "react-helmet-async",
        "react-hook-form",
        "@tanstack/react-query",
        "framer-motion",
        "react-aria-components",
        "@react-aria/focus",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-dialog",
        "@radix-ui/react-popover",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-select",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toast",
        "@radix-ui/react-slot",
      ],
    },

    // Note: previously we had aggressive `manualChunks` here that split
    // radix/datepicker/icons/supabase/tanstack into separate chunks.
    // That triggered a production-only TDZ ("Cannot access 'X' before
    // initialization") because Rollup hoisted module init across chunks.
    // Letting Vite/Rollup decide chunking automatically is the safe default.
  };
});
