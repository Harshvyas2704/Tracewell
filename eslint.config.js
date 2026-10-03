import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // The engine and scenarios are pure TypeScript. They must never depend on
    // React or on the UI layer. Do not disable or work around this rule.
    files: ["src/engine/**", "src/scenarios/**"],
    rules: {
      // Time is virtual and randomness is seeded, so runs stay deterministic.
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Use the engine clock." },
        { object: "Math", property: "random", message: "Use the seeded RNG." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: "Use the engine clock." },
        { name: "setInterval", message: "Use the engine clock." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "The engine must not import React." },
            { name: "react-dom", message: "The engine must not import React." },
          ],
          patterns: [
            {
              regex: "^react(-dom)?/",
              message: "The engine must not import React.",
            },
            {
              regex: "(^|/)ui(/|$)",
              message: "The engine must not import from src/ui.",
            },
          ],
        },
      ],
    },
  },
);
