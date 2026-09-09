# 30 · Blueprint

## 3 · The `actor` grammar

| Shape | Example | Means |
|---|---|---|
| `spark` | `spark` | the assistant, **only ever on `suggest`, `propose` or `predict`, never on a row write** |

That last row is an invariant with a test: **`event WHERE actor='spark' AND kind NOT IN
('suggest','propose','predict')` must always be empty.**

---

## 4 · The write path, in order
