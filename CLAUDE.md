## Invariants
- **Accounting spine**: the Transfer stream is the *sole* writer of `shares`/`assets`/`principal`
  and pool share totals.
- **Derived relations**: use `@derivedFrom` and store the forward `_id` foreign key; never materialize
  reverse arrays.
- **Addresses** are stored and compared lowercase everywhere.

## Model
- Ids are chain-id-scoped — `${chainId}-${address}` (`scopedId`); one `Position` per (user, pool).

## Session hygiene
- Don't re-read a file already loaded in context this session unless it changed on disk; reuse what's already there, or grep just the part you need instead of reading it whole again.
- Grep `envio tools fetch-docs` output to the relevant section before it lands in context, instead of dumping the raw doc.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
