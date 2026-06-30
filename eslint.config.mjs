// Flat ESLint config — warn-mode adoption (see CLAUDE.md / harness audit).
// Goal: surface issues without blocking. The high-volume existing-debt rules
// and all jsx-a11y rules are downgraded to "warn"; CI runs lint non-blocking.
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Flip every jsx-a11y "recommended" rule to "warn".
const a11yWarn = Object.fromEntries(
  Object.keys(jsxA11y.flatConfigs.recommended.rules).map((r) => [r, "warn"])
);

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "api/index.js",
      "drizzle/meta/**",
      "node_modules/**",
      "client/public/**",
      ".claude/**",
      "**/*.config.{js,ts,mjs,cjs}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Client (browser + React) — enable a11y + hooks lint as warnings.
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y, "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...a11yWarn,
      // Intentional team pattern: dialogs and the post-spin result modal
      // autofocus their primary input/action so focus lands inside the overlay
      // (it also has a global Escape handler). Off rather than per-site disables.
      "jsx-a11y/no-autofocus": "off",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Server + shared run on Node.
  {
    files: ["server/**/*.ts", "shared/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Downgrade the known-noisy existing-debt rules to warnings (warn-mode
  // adoption). no-undef is off: TypeScript already checks undefined identifiers,
  // and the base rule false-positives on TS/DOM globals.
  {
    rules: {
      "no-undef": "off",
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
