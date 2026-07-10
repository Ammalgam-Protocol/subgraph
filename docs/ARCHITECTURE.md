# Ammalgam Indexer Architecture

High-level map of the codebase. Quickstart: [`README.md`](../README.md). Agent-facing rules:
`CLAUDE.md` and `.claude/rules/`.

## Overview

Ammalgam is an on-chain AMM plus lending market. Each pair exposes six lending tokens (deposit and
borrow of liquidity L and the two assets X, Y). This is an [Envio HyperIndex](https://docs.envio.dev)
V3 indexer: it subscribes to protocol events, maintains a derived entity model in Postgres, and
serves it over a Hasura GraphQL API. It was migrated from a TheGraph subgraph, so the entity model
and accounting semantics mirror the original.

Stack: Envio `3.2.1`, viem `2.55.0`, TypeScript / Node >= 22 / pnpm, Biome 2, Vitest 4, Postgres +
Hasura.

## Layout

```
config.yaml       # chains, contracts, events (Sepolia); config.mainnet.yaml = mainnet variant
schema.graphql    # entities = the Postgres schema and GraphQL surface
src/handlers/     # one file per contract: event handlers + dynamic registration
src/utils/        # pure helpers (100% coverage gate) + the token-metadata effect
test/             # handlers/ (offline behavioral), utils/ (unit), integration/ (real-block replay)
```

## How it is wired

Config-driven: `config.yaml` maps each contract to one handler and lists its events;
`schema.graphql` defines the entities; `pnpm codegen` compiles both into typed bindings. Everything
is chain-id-scoped (Sepolia today, multichain-ready).

| Contract | Handler | Role |
|---|---|---|
| `AmmalgamFactory` | `factory.ts` | Creates `Token`/`Pool`/`LendingToken`; registers pairs + lending tokens. |
| `AmmalgamPair` | `pair.ts` | Reserves, prices, volume, interest, external liquidity. |
| `ERC4626Deposit` | `deposit.ts` | Deposit-X / Deposit-Y tokens. |
| `ERC20DepositLiquidity` | `depositLiquidity.ts` | Deposit-L token. |
| `ERC4626Debt` | `borrow.ts` | Borrow-X / Borrow-Y tokens. |
| `ERC20DebtLiquidity` | `borrowLiquidity.ts` | Borrow-L token. |

**Dynamic registration**: only the factory has a static address. Pairs and their six lending tokens
are deployed at runtime and registered on `LendingTokensCreated` / `PairCreated` (same
`createPair` tx). The model is order-independent by design: each `LendingToken` stores its `pool_id`
and `Pool.lendingTokens` is a `@derivedFrom` lookup, so handlers read persisted rows, not a
same-batch shell.

## Data model

A pool has six lending tokens indexed by `tokenType`:
(`DEPOSIT_L=0, DEPOSIT_X=1, DEPOSIT_Y=2, BORROW_L=3, BORROW_X=4, BORROW_Y=5`).
`Pool.totalAssets` / `totalShares` and `Position.assets` / `shares` are length-6 arrays at that index.

Core entities: `Token`, `LendingToken`, `Pool`, `User`, `Position`, plus one entity per event.
`Position` is one per (user, pool). Reverse relations use `@derivedFrom` (never materialized reverse
arrays), which also makes cross-event ordering irrelevant.

## Accounting spine (the key idea)

Positions are accounted from the ERC-20 `Transfer` stream, **not** from the semantic events. Two
write paths, both in `src/handlers/shared.ts`:

- **Semantic events** (`Deposit`, `Withdraw`, `Borrow`, `Repay`, and the liquidity `Mint` / `Burn` /
  `BorrowLiquidity` / `RepayLiquidity`) write counters and the event entity, attributed to the raw
  on-chain recipient. They do not touch balances.
- **The lending-token `Transfer` stream** (`handleLendingTokenTransfer`) is the sole writer of
  `shares` / `assets` / `principal` and pool totals, classifying each transfer as mint (`from=0x0`),
  burn (`to=0x0`), or move.

This keeps a single source of truth for who holds what, with no peripheral-router rewrite
heuristics.

## Testing

Handler behavior is tested offline with `createTestIndexer()` (`test/handlers/`); pure helpers have
unit tests under the 100% coverage gate (`test/utils/`); real-block Sepolia replay lives in
`test/integration/`, gated by `ENVIO_API_TOKEN`.

Worker-thread note: effects run in the Envio worker thread, so `vi.mock('viem')` cannot reach them
(`test/setup.ts` points RPC at an unreachable host instead), and handlers cannot be line-instrumented
(hence the coverage gate is `src/utils/**` only; handlers are covered behaviorally).
