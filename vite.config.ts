import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
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
}));
