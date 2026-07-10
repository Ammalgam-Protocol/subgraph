## Invariants
- **Accounting spine**: the Transfer stream is the *sole* writer of `shares`/`assets`/`principal`
  and pool share totals.
- **Derived relations**: use `@derivedFrom` and store the forward `_id` foreign key; never materialize
  reverse arrays.
- **Addresses** are stored and compared lowercase everywhere.

## Model
- Ids are chain-id-scoped — `${chainId}-${address}` (`scopedId`); one `Position` per (user, pool).
