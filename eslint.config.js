import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "supabase/functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.app.json" },
        node: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Prevent circular imports that caused production TDZ
      // ("Cannot access 'X' before initialization"). Ignore dynamic imports
      // since they are split into separate chunks and don't create TDZ.
      "import/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true, allowUnsafeDynamicCyclicDependency: true }],
      // Force every WhatsApp send to go through src/lib/dispatchWhatsAppSend.ts.
      // The dispatcher file itself is excluded via the override below.
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.object.property.name='functions'][callee.property.name='invoke'] > Literal:first-child[value=/^(twilio|meta)-whatsapp-send$/]",
        message: "Não invoque twilio-whatsapp-send/meta-whatsapp-send diretamente. Use dispatchWhatsAppSend de @/lib/dispatchWhatsAppSend.",
      }],
    },
  },
  {
    files: ["src/lib/dispatchWhatsAppSend.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
