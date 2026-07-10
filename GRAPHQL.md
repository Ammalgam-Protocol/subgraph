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
