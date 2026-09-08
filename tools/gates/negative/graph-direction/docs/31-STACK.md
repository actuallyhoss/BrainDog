# 31 · Stack — the fixture's copy

A seeded negative for `tools/gates/graph.mjs`. The gate reads `31 §2`'s order out of this table, so
a fixture that does not carry one has no order at all and every package in it is unranked — which
would make every fixture report the same finding instead of the one it was seeded for.

Only the ranks matter here; the real table's `Depends on` column is documentation.

## 2 · The package graph

| # | Package | Depends on |
|---|---|---|
| 1 | `render` | — |
| 2 | `ports` | — |
| 3 | `where` | 2 |
| 4 | `theme` | — |
| 5 | `skin` | 4 |
| 6 | `fixtures` | — |
| 7 | `kernel` | 2, 3 |
| 8 | `declare` | 2, 7 |
| 9 | `extract` | 2, 3 |
| 10 | `seed` | 2, 3, 7, 8 |
| 11 | `record` | 1, 2, 3, 7, 8 |
| 12 | `mcp` | 2, 11 |
| 13 | `spark` | 2, 3, 11 |
| 14 | `connect` | 2, 9, 11 |
| 15 | `host` | 2, 11 |
| 16 | `client` | 2, 15 |
| 17 | `web` | 1, 4, 5, 7, 10 |
| 18 | `site` | 5 |
| 19 | `cli` | 1, 2, 3, 7, 8, 13 |
| 20 | `worker` | 2, 7, 11, 15 |
| 21 | `selfhost` | 2, 7, 11, 15, 16 |
