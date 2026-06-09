import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Run once by default (no watch mode) for `pnpm test`; use `vitest --watch` to opt in.
    watch: false,
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Handlers are reported for visibility but cannot be line-instrumented:
      // createTestIndexer runs them in a Node worker thread that v8 coverage does
      // not observe. They are fully exercised by the test/handlers/* behavioral
      // tests. The 100% gate is enforced on the pure, in-process unit code.
      include: ['src/**'],
      exclude: ['**/*.config.*'],
      thresholds: {
        'src/utils/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
})
