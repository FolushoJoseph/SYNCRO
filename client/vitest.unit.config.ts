/**
 * Vitest config for pure unit tests (no browser, no Storybook).
 * Run with: npx vitest --config vitest.unit.config.ts --run
 *
 * Kept separate from vitest.config.ts which is wired to Storybook browser tests.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/supabase/**", "node_modules"],
    },
  },
})
