import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/components/ui"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/api/**/*.ts", "src/sim/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Components must go through HabitatApi / RealtimeClient (Demo Director uses api.sim.*).
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.ts", "src/stores/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/sim/*", "@/api/mock/*", "**/sim/**", "**/api/mock/**"] }],
    },
  },
);
