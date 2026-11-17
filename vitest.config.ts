import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone test config: the app's vite.config.ts pulls in TanStack Start and
// Cloudflare build plugins that a unit-test run does not need.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
