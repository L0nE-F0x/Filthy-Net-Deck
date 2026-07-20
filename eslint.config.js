// Lint scope matches what CI tests: app source + pipeline. Generated output,
// native target dirs, one-off release scripts, and marketing assets are out.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "website/**",
      "public/**",
      "marketing-video/**",
      "scripts/**",
      "goal/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Classic correctness pair only. The plugin's v6 "recommended" adds
      // React-Compiler-era rules (set-state-in-effect, refs, immutability)
      // that flag this codebase's deliberate consume-once deep-link pattern
      // (see useAppStore statsFocusDeckKey et al.) — revisit if/when the
      // app adopts the React Compiler.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // House style: `catch { /* ignore */ }` — the comment documents intent.
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["pipeline/**/*.mjs", "vite.config.ts", "vitest.config.ts"],
    extends: [js.configs.recommended],
    rules: {
      // `const { previews: _drop, ...rest } = s` — rest-omit destructuring.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
