import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Run once by default (no watch mode) for `pnpm test`; use `vitest --watch` to opt in.
    watch: false,
    environment: 'node',
    testTimeout: 20000,
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: ['**/*.config.*'],
      thresholds: {
        'src/utils/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
})
