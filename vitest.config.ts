import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Map the "@/..." path alias (see tsconfig.json) so tests can import app code.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
      // "server-only" throws on import outside a Server Component, which blocks
      // tests from importing any module that transitively pulls it in (e.g.
      // lib/db/warehouse). Stub it out: the guard is a build-time concern.
      "server-only": resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    env: {
      // Dashboard response caching off by default in tests so repeated route
      // calls stay observable; cache-specific tests opt back in explicitly.
      DASHBOARD_CACHE_TTL_MS: "0",
    },
  },
})
