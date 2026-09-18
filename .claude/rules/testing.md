---
paths:
  - "test/**/*.ts"
---

- **Effects can't be mocked.** Handlers and effects are loaded via envio's own dynamic import
  (`HandlerLoader.registerAllHandlers`), which bypasses vitest's `vi.mock('viem')` entirely.
  Instead `test/setup.ts` points `ENVIO_RPC_URL_*` at an unreachable host with
  `ENVIO_RPC_RETRY_COUNT=0`, so reads fail fast to their fallbacks deterministically.
- **Coverage.** The 100% gate is on `src/utils/**` only. Handlers load through that same
  envio-owned dynamic import and **cannot** be instrumented; cover them with behavioral
  `test/handlers/*` tests, not coverage numbers.
