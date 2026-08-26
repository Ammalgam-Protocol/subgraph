---
paths:
  - "src/**/*.ts"
---

## Handler traps
- **No module-level mutable state.** Handlers run twice under preload, so any module-scope
  `let`/cache corrupts across runs; keep all state in the entity store. Exception: idempotent
  memoization of connection-like objects whose value does not depend on event data (the `clients`
  cache in `rpcClient.ts`), where the second run recomputes the same thing.
- Two ID forms, don't cross them: entity ids and `_id` foreign keys use `scopedId`
  (`${chainId}-${address}`); contract registration, effect inputs, and config lookups use the
  **raw lowercased on-chain address**, which handlers take from `event.srcAddress`.

## Effects & tokens
- RPC env vars must be `ENVIO_`-prefixed — only those are exposed at runtime:
  `ENVIO_RPC_URL_<chainId>`, `ENVIO_RPC_RETRY_COUNT`. Keep `VIEM_CHAINS` in sync with `chains.ts`
- Token `decimals >= 255` is treated as a failed read and coerced to `0`.
- `getClient` (`rpcClient.ts`) / the effect wrappers run in the Envio worker thread, invisible to v8
  coverage: they carry `/* v8 ignore */` and are exercised end-to-end by
  `test/handlers/factory.test.ts` (token metadata), `test/handlers/swapFees.test.ts` and
  `test/handlers/referenceReserves.test.ts` (reference reserves).
