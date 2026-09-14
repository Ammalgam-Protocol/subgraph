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

Expected divergences from the merged DefiLlama adapter, for the same day and pool: swap fees
agree in concept (what the trader paid) and additionally cover two-sided swaps the adapter never
counted; protocol X/Y revenue agrees to the wei; our interest is gross where theirs is the LP
slice only.

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
