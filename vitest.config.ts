import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Needed so component tests can use JSX. The app's own vite.config.ts is not
  // read by vitest, so the plugin has to be named here too.
  plugins: [react()],
  test: {
    // Almost everything here is pure logic and runs faster without a DOM.
    // The handful of component tests opt in per-file with
    // `// @vitest-environment jsdom` rather than slowing the whole suite down.
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "pipeline/**/*.test.mjs",
      "netlify/**/*.test.mts",
    ],
  },
});
