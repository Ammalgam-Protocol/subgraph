## Invariants
- **Accounting spine**: the Transfer stream is the *sole* writer of `shares`/`assets`/`principal`
  and pool share totals.
- **Derived relations**: use `@derivedFrom` and store the forward `_id` foreign key; never materialize
  reverse arrays.
- **Addresses** are stored and compared lowercase everywhere.

## Model
- Ids are chain-id-scoped — `${chainId}-${address}` (`scopedId`); one `Position` per (user, pool).

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
