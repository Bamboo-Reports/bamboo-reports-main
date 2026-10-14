import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Config for the data fetch benchmark (scripts/benchmark/). Kept separate from
// vitest.config.ts so `npm test` never picks it up: it hits the live warehouse
// and takes minutes. Run with `npm run bench`.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
      "server-only": resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/benchmark/**/*.run.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    env: {
      // Core mode must always measure the warehouse, never the response cache.
      DASHBOARD_CACHE_TTL_MS: "0",
    },
  },
})
