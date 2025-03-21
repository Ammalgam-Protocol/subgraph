# Example queries

### Pool stats

```graphql
{
  pools(first: 3, orderBy: createdAtTimestamp, orderDirection: asc) {
    id
    name
    tokenX {
      symbol
    }
    tokenY {
      symbol
    }
    reserveX
    reserveY
    tokenXPrice
    tokenYPrice
    borrowCount
    depositCount
    repayCount
    withdrawCount
    swapCount
    syncCount
    transferCount
  }
}
```

### User stats

```graphql
{
  user(id: "<wallet address>") {
    id
    positionCount
    borrowCount
    depositCount
    repayCount
    withdrawCount
    swapCount
    transferredCount
    receivedCount
  }
}
```

### Position stats

```graphql
{
  positions(where: { user: "<wallet address>" }) {
    assets
    shares
    borrowCount
    depositCount
    repayCount
    withdrawCount
    transferredCount
    receivedCount
  }
}
```