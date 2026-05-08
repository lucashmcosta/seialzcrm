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
  build: {
    rollupOptions: {
      output: {
        // Isolate heavy vendor libs in their own chunks to avoid
        // cross-module TDZ ("Cannot access 'X' before initialization")
        // crashes from circular dependency hoisting in production.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("react-day-picker") || id.includes("date-fns")) return "datepicker";
          if (id.includes("@phosphor-icons")) return "icons";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "tanstack";
          return undefined;
        },
      },
    },
  },
}));
