import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    include: [
      "app/**/*.test.ts",
      "lib/**/*.test.ts",
      "worker/**/*.test.ts",
      "cloudflare/**/*.test.ts",
      "tests/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", ".claude/**", ".next/**"],
  },
});
