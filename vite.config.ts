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

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      sentryEnabled &&
        sentryVitePlugin({
          org: sentryOrg,
          project: sentryProject,
          authToken: sentryAuthToken,
        }),
    ].filter(Boolean),
    build: {
      // "hidden" keeps source maps off the public bundle but lets the Sentry
      // plugin upload them. Only meaningful when the plugin is enabled, but
      // safe either way.
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
