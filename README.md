# Ammalgam Indexer

An [Envio HyperIndex](https://docs.envio.dev) (V3) indexer for the **Ammalgam Protocol**, an
on-chain AMM plus lending market. It ingests contract events into Postgres and serves them over a
Hasura GraphQL API. Migrated from the original TheGraph subgraph; the entity model and accounting
semantics mirror it.

> Architecture, data model, and handler patterns: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
> Conventions for AI agents working in this repo: `CLAUDE.md` and `.claude/rules/`.

## Prerequisites

- Node.js >= 22
- pnpm (this repo uses pnpm, not npm)
- Docker and Docker Compose (Envio runs Postgres plus the Hasura GraphQL engine locally)

## Setup

```bash
pnpm install
pnpm codegen   # generate types from config.yaml + schema.graphql
```

Rerun `pnpm codegen` after editing `config.yaml` or `schema.graphql`, otherwise the generated
types under `.envio/` go stale.

## Run locally

```bash
pnpm dev       # envio dev: starts Postgres + Hasura via docker-compose and runs the indexer
```

The GraphQL playground is served by Hasura at http://localhost:8080 (Postgres is exposed on host
port 5433). `pnpm start` runs the indexer without the dev tooling.

## Commands

| Command | Purpose |
|---|---|
| `pnpm codegen` | Regenerate types. Required after editing `config.yaml` or `schema.graphql`. |
| `pnpm dev` / `pnpm start` | Run the indexer (with / without dev tooling). |
| `pnpm test:run` | Offline unit + handler suite (no coverage thresholds). |
| `pnpm test:coverage` | Same suite plus the 100% coverage gate on `src/utils`. |
| `pnpm test:integration` | Sepolia real-block replay (needs `ENVIO_API_TOKEN`). |
| `pnpm check` / `pnpm check:fix` | Biome lint + format (report / autofix). |
| `pnpm exec tsc --noEmit` | Typecheck (run `pnpm codegen` first). |

## Configuration

- **Chains, contracts, events**: `config.yaml` (Sepolia, chain id `11155111`). Events are declared
  inline (no separate ABI files). `config.mainnet.yaml` is the mainnet variant.
- **Entities**: `schema.graphql`.
- **RPC**: set `ENVIO_RPC_URL_<chainId>` (for example `ENVIO_RPC_URL_11155111`); optional
  `ENVIO_RPC_RETRY_COUNT`. Only `ENVIO_`-prefixed env vars are exposed to the indexer at runtime.

## Deployment

Build the image with the provided `Dockerfile` (`CMD pnpm envio start`) for self-hosting, or deploy
to Envio's hosted service. Sepolia and mainnet run as two separate indexers, so quota and blast
radius stay isolated.

## Quality gates

`lefthook` runs Biome on staged files pre-commit and `codegen -> tsc --noEmit -> test:coverage`
pre-push; CI runs the same plus a gated integration job. In-session, the hooks in
`.claude/settings.json` auto-format on edit and run a lint + typecheck gate.
