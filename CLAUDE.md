# Ammalgam Indexer — Conventions (Envio HyperIndex V3)

Indexes the Ammalgam protocol (an AMM + lending market) into a GraphQL-queryable
store. Migrated from a TheGraph subgraph to Envio HyperIndex V3; the entity model
and accounting semantics mirror the original subgraph.

## Toolchain
- Node ≥22, **pnpm** (never npm), **pnpm dlx** (never npx). Envio `3.1.1`, viem `2.52.2`.
- Lint/format: Biome 2. Tests: Vitest 4. Types: TypeScript 5.9, `tsc --noEmit`.
- Hooks (lefthook): pre-commit runs Biome on staged files; pre-push runs `codegen` → `tsc --noEmit` → `test:coverage`. CI (`.github/workflows/ci.yml`) runs the same plus a gated integration job.
- Run locally with Docker: `docker-compose.yaml` brings up Postgres + the Hasura GraphQL engine; `Dockerfile` builds the indexer image.

## Commands
- `pnpm codegen` — regenerate types (run before typecheck/tests; required after editing `config.yaml` or `schema.graphql`)
- `pnpm dev` / `pnpm start` — run the indexer
- `pnpm test:run` — offline unit + handler suite (no coverage thresholds)
- `pnpm test:coverage` — same suite + the 100% coverage gate on `src/utils` (CI and pre-push run this)
- `pnpm test:integration` — Sepolia real-block replay (needs `ENVIO_API_TOKEN`)
- `pnpm check` / `pnpm check:fix` — Biome lint + format
- `pnpm tsc --noEmit` — typecheck (codegen first, or `.envio/types.d.ts` is stale)

## Architecture
- **Config-driven** (`config.yaml`): each contract maps to one handler file under `src/handlers/`. ABIs live in `abis/`. Currently single-chain (Sepolia, `11155111`) but everything is chain-id-scoped to stay multichain-ready.
- **Contracts & handlers** (one file per contract):
  - `AmmalgamFactory` → `factory.ts` — `PairCreated`, `LendingTokensCreated`
  - `AmmalgamPair` → `pair.ts` — `Sync`, `Swap`, `Liquidate`, `InterestAccrued`, `BurnBadDebt`
  - `ERC4626Deposit` → `deposit.ts` — `Deposit`, `Withdraw`, `Transfer`
  - `ERC20DepositLiquidity` → `depositLiquidity.ts` — `Mint` (deposit-L), `Burn` (withdraw-L), `Transfer`
  - `ERC4626Debt` → `borrow.ts` — `Borrow`, `Repay`, `Transfer`
  - `ERC20DebtLiquidity` → `borrowLiquidity.ts` — `BorrowLiquidity`, `RepayLiquidity`, `Transfer`
- **Factory / dynamic registration**: only `AmmalgamFactory` has a static address. On `LendingTokensCreated` (the 6 lending-token contracts) and `PairCreated` (the pair), `contractRegister` adds the new addresses via `context.chain.<Contract>.add(addr)`. `LendingTokensCreated` fires before `PairCreated` in the same `createPair` tx.
- **`src/utils/`** — pure, in-process helpers + the external-read effect. Fully unit-tested; the 100% coverage gate applies here.

## Data model (`schema.graphql`)
- Core entities: `Token`, `LendingToken`, `Pool`, `User`, `Position`; plus one entity per event (`Deposit`, `Withdraw`, `Borrow`, `Repay`, `Transfer`, `Swap`, `Sync`, `Liquidate`, `InterestAccrued`, `BurnBadDebt`).
- **Token-type indexing**: a pool has 6 lending tokens, indexed by the constants in `utils/constants.ts`: `DEPOSIT_L=0, DEPOSIT_X=1, DEPOSIT_Y=2, BORROW_L=3, BORROW_X=4, BORROW_Y=5`. `Pool.totalAssets/totalShares` and `Position.assets/shares` are **length-6 `[BigInt!]!` arrays indexed by `tokenType`** — never reorder these.
- Reverse relations use `@derivedFrom` (e.g. `Pool.lendingTokens`, `User.positions`). Do **not** maintain materialized reverse arrays; store the forward `_id` foreign key and let the derived field resolve it — this also makes cross-event ordering irrelevant (it reads persisted rows, not same-batch shells).
- `Position` id is `userId-poolId`; one position per (user, pool).

## Handler rules
- Register with the unified API from `'envio'`: `indexer.onEvent({ contract, event }, fn)` and `indexer.contractRegister({ contract, event }, fn)`.
- Add dynamic contracts with `context.chain.<ContractName>.add(addr)`.
- Use `event.chainId` for the chain id. **Never** `context.chain.id`.
- Update entities immutably: `context.X.set({ ...prev, ...changes })`.
- No module-level mutable state (preload-unsafe) — use the entity store.
- External reads go through `context.effect(effect, input)`; define effects with `createEffect({ ..., cache: true })`.
- BigInt for token amounts/reserves/shares; BigDecimal (from `'envio'`) for prices/volume.
- No `Date.now()` / `Math.random()` in handlers.
- Guard every lookup: `const pool = await context.Pool.get(id); if (!pool) return`. Handlers no-op rather than throw on missing parents.

## Handler patterns (be consistent with existing code)
- **IDs** (`utils/id.ts`): `scopedId(chainId, address)` → `${chainId}-${address}` for all entity ids and `_id` foreign keys; `getEventId(chainId, hash, logIndex)` for event-entity ids; `getPositionId(userId, poolId)`. Contract registration, effect inputs, and config lookups use the **raw on-chain address** (lowercased for comparisons), not the scoped id.
- **Get-or-create**: load, and if absent build via the `createDefaultX` factory (`utils/user.ts`, `pool.ts`, `position.ts`). Bump `positionCount` only when a new position is created.
- **Balance math** (`utils/array.ts`): mutate the length-6 arrays only through `addAt` / `subtractAt` / `updateAt` at the `tokenType` index (returns a fresh array). Deposits/borrows add; withdraws/repays subtract.
- **Principal** (`utils/math.ts`): for X/Y deposit tokens, convert the asset delta to L-units with `convertXToL` / `convertYToL` using `reserve` and `activeLiquidity = totalAssets[DEPOSIT_L] - totalAssets[BORROW_L]`. For liquidity tokens, principal moves by the raw asset amount.
- **Prices/volume**: `convertTokenToDecimal(amount, decimals)` then `safeDiv` (returns `ZERO_BD` on divide-by-zero). `Pool` prices are recomputed on `Sync` and `InterestAccrued`.
- **Peripheral rewrite**: when the recipient (`to` / `receiver` / `onBehalfOf`) is in `config.peripheralAddresses`, attribute the position to `event.transaction.from` instead. (Requires `transaction.from` in `field_selection`.)
- **Transfer filtering**: skip when either side is in `[ADDRESS_ZERO, ...peripheralAddresses]`, when `value === 0n`, or when either side equals the pool contract itself. A transfer with no existing sender position is a no-op.
- **Chain config** (`utils/chains.ts`): per-chain `peripheralAddresses`, `whitelistTokens`, `stablecoinAddresses`, `tokenOverrides`, `poolsToSkip`, `nativeTokenDetails`. **All addresses stored lowercase**; always compare with `.toLowerCase()`. `getChainConfig` throws on an unsupported chain.

## Effects (external reads)
- `utils/tokenEffects.ts` defines `fetchTokenMetadata` — one batched effect per token resolving `{ symbol, name, decimals }` together (viem multicall), `cache: true`, `rateLimit: false`, validated with the `S` schema from `'envio'`. Input is `"${chainId}:${address}"`.
- Resolvers (`resolveTokenSymbol/Name/Decimals`) are pure and take an injected `ReadOnlyClient` so they unit-test without network. Fallbacks: native-token details for `ADDRESS_ZERO`, `tokenOverrides`, then on-chain read, else `'unknown'`/`0` (decimals ≥ 255 treated as a failed read → 0).
- RPC env vars must be `ENVIO_`-prefixed (only those are exposed at runtime): `ENVIO_RPC_URL_<chainId>`, `ENVIO_RPC_RETRY_COUNT`. Keep `VIEM_CHAINS` in sync with `chains.ts`.
- The `getClient` / effect-wrapper code runs in the Envio worker thread (invisible to v8 coverage) — it carries `/* v8 ignore */` and is exercised end-to-end by `factory.test.ts`.

## Imports
- Import only from `'envio'`. **Never** from `'generated'` (Biome `noRestrictedImports`, lint-enforced).

## Testing
- Handler tests: `createTestIndexer()` + `indexer.process({ chains: { <id>: { simulate: [...] } } })` (offline). Seed prerequisite entities directly (`indexer.X.set(...)`), then assert with `getOrThrow` invariants and/or snapshot `result.changes`.
- Unit tests (`test/utils/`) cover pure helpers directly and carry the 100% gate.
- Effects never hit the network offline: handler effects run in the worker thread, so `vi.mock('viem')` can't reach them — instead `test/setup.ts` points `ENVIO_RPC_URL_*` at an unreachable host with `ENVIO_RPC_RETRY_COUNT=0`, so reads fail fast to fallbacks deterministically. Resolver logic is unit-tested directly.
- Real-block replay lives in `test/integration/` (`vitest.integration.config.ts`), gated by `ENVIO_API_TOKEN` (`describe.skipIf`), excluded from the offline suite and the coverage gate.

## Coverage
- 100% (lines/branches/functions/statements) gate on `src/utils/**` only. Handlers are reported for visibility but **cannot** be line-instrumented (worker thread) — cover them with behavioral `test/handlers/*` tests, not coverage. Use `/* v8 ignore */` only for genuinely worker-only code, with a comment explaining why.

## Style
- Biome: single quotes, **no semicolons**, trailing commas, width 100, 2-space indent, organized imports. `noUnusedVariables`/`noUnusedImports` are errors. Run `pnpm check:fix` before committing.
