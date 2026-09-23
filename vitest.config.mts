import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
  } },
  test: { include: ["tests/critical/**/*.test.ts"], fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000 },
});
