# Example queries

The GraphQL API is Hasura (served by `graphql-engine`, default http://localhost:8080). The dialect
differs from TheGraph: query roots are the capitalized entity type (`Pool`, not `pools`), pagination
is `limit` / `offset`, ordering is `order_by: { field: asc }`, and filters use
`where: { field: { _eq: ... } }`.

Entity ids are chain-scoped: `${chainId}-${address}` with the address lowercased (Sepolia chainId is
`11155111`). Use the Hasura console GraphiQL for the authoritative, always-current schema.

### Pool stats

```graphql
{
  Pool(limit: 3, order_by: { createdAtTimestamp: asc }) {
    id
    name
    tokenX { symbol }
    tokenY { symbol }
    reserveX
    reserveY
    tokenXPrice
    tokenYPrice
    depositCount
    borrowCount
    swapCount
  }
}
```

### User stats

```graphql
{
  User(where: { id: { _eq: "11155111-0x0000000000000000000000000000000000000000" } }) {
    id
    positionCount
    depositCount
    borrowCount
    repayCount
    withdrawCount
    swapCount
    transferredCount
    receivedCount
  }
}
```

### Positions for a user

```graphql
{
  Position(where: { user_id: { _eq: "11155111-0x0000000000000000000000000000000000000000" } }) {
    id
    assets
    shares
    principal
    depositCount
    borrowCount
  }
}
```

### Daily fees (adapter query contract)

One query per UTC day returns every pool's fee columns:

```graphql
query FeesForDay($date: Int!) {
  PoolDayData(where: { date: { _eq: $date } }) {
    pool { id tokenX { id } tokenY { id } }
    swapFeesTokenX swapFeesTokenY
    grossInterestTokenX grossInterestTokenY grossInterestTokenLAsX grossInterestTokenLAsY
    protocolInterestTokenX protocolInterestTokenY protocolInterestTokenLAsX protocolInterestTokenLAsY
    protocolFeesTokenX protocolFeesTokenY protocolFeesTokenLAsX protocolFeesTokenLAsY
    penaltiesTokenLAsX penaltiesTokenLAsY
  }
}
```

Per pool and per leg (X shown, Y identical), added to the DefiLlama balances under that leg's
token:

```
protocolRevenue   = protocolFeesTokenX + protocolFeesTokenLAsX
borrowerFees      = protocolRevenue - (protocolInterestTokenX + protocolInterestTokenLAsX)
dailyFees         = swapFeesTokenX + grossInterestTokenX + grossInterestTokenLAsX
                  + borrowerFees + penaltiesTokenLAsX
supplySideRevenue = dailyFees - protocolRevenue
holdersRevenue    = 0
```

`lpInterestTokenL` / `lpInterestTokenLAsX/Y` is deliberately absent from this identity. It is
already inside `grossInterestTokenX/Y`, and adding it would double count. `date` is a UTC day
start matching `getTimestampAtStartOfDayUTC` (`date % 86400 === 0`).

The fields intentionally do not reproduce every category or valuation choice in the merged
DefiLlama adapter:

| Field | Adapter category | Matches or differs | Reason |
| --- | --- | --- | --- |
| `grossInterestTokenX/Y`, `grossInterestTokenLAsX/Y` | LP interest | Differs | The indexer records gross borrower interest while the adapter records only the LP portion. |
| `penaltiesTokenLAsX/Y` | None | Differs | The adapter does not separately add penalty debt mints. |
| `lpInterestTokenLAsX/Y` | Native LP interest | Differs | L twins value active-liquidity growth rather than actual X and Y reserve increments. |
| `*TokenLAsX/Y` | L-based revenue valuation | Differs | The indexer uses event state while the adapter can use later state from the same block. |
| `protocolFeesToken*` | Protocol revenue | Matches in total; differs by source | Actual pair-originated mints are combined rather than split into initial lending and over-repayment fees. |
| `volumeTokenX/Y` | Volume | Differs | The indexer adds inputs and outputs while the adapter uses inputs only. |
| `swapFeesTokenX/Y` for ordinary one-input swaps | Swap fees | Matches | The proof-checked ceiling equals the first passing input for a non-depleted opposite-output swap. |
| `swapFeesTokenX/Y` for depleted swaps | Swap fees | Differs | The indexer uses the adjusted invariant rather than raw constant-product inference. |
| `swapFeesTokenX/Y` for same-token swaps | Swap fees | Differs | The indexer records input minus output while the adapter records zero when the opposite output is zero. |
| `swapFeesTokenX/Y` for two-sided swaps | Swap fees | Differs by leg | The indexer allocates both inputs while the adapter counts a leg only when its opposite output is positive. |
| `feeL` / `swapFeesTokenL` vs native swap fees | Swap fees | Differs | Active-liquidity growth and native input retained are separate measurements and must not be converted or summed. |

### Swap alert (cf-api)

```graphql
{
  Swap(where: { hash: { _eq: "0x..." } }) {
    amountXIn
    amountYIn
    amountXOut
    amountYOut
    feeL
    feeAmountX
    feeAmountY
  }
}
```

Followed by the `Sync` in the same transaction for price impact, as today.
