# 30 · Blueprint

## 3 · The `actor` grammar

| Shape | Example | Means |
|---|---|---|
| `slash` | `slash` | the assistant, **only ever on `suggest`, `propose` or `predict`, never on a row write** |

That last row is an invariant with a test: **`event WHERE actor='slash' AND kind NOT IN
('suggest','propose','predict')` must always be empty.**

---

## 4 · The write path, in order
