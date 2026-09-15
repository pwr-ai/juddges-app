// eslint-config-next 16 ships flat configs directly, so the FlatCompat bridge
// this file used to need is gone. Loading the v16 configs through FlatCompat
// fails outright — @eslint/eslintrc tries to validate them as eslintrc data and
// throws on the plugin objects' circular references.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Keep these last so they win over the shared configs above.
    rules: {
      "react-hooks/exhaustive-deps": "error",

      // eslint-plugin-react-hooks v6 arrives with this config and turns on the
      // React Compiler rule set, which our code trips 97 times. None of it was
      // enforced under eslint-config-next 15, so it is newly surfaced debt
      // rather than a regression, and fixing it is not part of a config bump.
      // Kept visible as warnings and tracked in #605, which promotes each rule
      // back to "error" as it is cleared.
      "react-hooks/set-state-in-effect": "warn",
      // #605: cleared, so it is enforced again.
      "react-hooks/static-components": "error",
      "react-hooks/preserve-manual-memoization": "warn",
      // #605: cleared, so it is enforced again.
      "react-hooks/refs": "error",
      "react-hooks/immutability": "warn",
      // #605: cleared, so it is enforced again.
      "react-hooks/purity": "error",

      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
