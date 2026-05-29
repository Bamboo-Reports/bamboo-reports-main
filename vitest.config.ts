import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Map the "@/..." path alias (see tsconfig.json) so tests can import app code.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
