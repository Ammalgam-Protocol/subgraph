---
paths:
  - "test/**/*.ts"
---

- **Effects can't be mocked.** Handler effects run in the Envio worker thread, so `vi.mock('viem')`
  never reaches them. Instead `test/setup.ts` points `ENVIO_RPC_URL_*` at an unreachable host with
  `ENVIO_RPC_RETRY_COUNT=0`, so reads fail fast to their fallbacks deterministically. Unit-test
  resolver logic directly.
- **Coverage.** The 100% gate is on `src/utils/**` only. Handlers run in the worker thread and
  **cannot** be line-instrumented — cover them with behavioral `test/handlers/*` tests, not coverage
  numbers. Use `/* v8 ignore */` only for genuinely worker-only code, with a comment saying why.
