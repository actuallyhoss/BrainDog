# 40 · Fixtures — a fixture, not the document

## 6 · Refusals and errors

The package raises none. It **carries** the seventy-five fixtures of [30-BLUEPRINT](30-BLUEPRINT.md) §6 — one file
per code, named by that table's *Fixture* column — and this section fixes their shape.

**Rule one: a fixture that fails `declare` lint is a test failure, not a fixture.** Every pack in `packs/`, every
`pack:` inside a `lint`/`install` refusal fixture, and every inline declaration lints clean — except where the
fixture *is* the lint failure, in which case the file names the code and the test asserts that code and no other.
The one pack this applies to is `reactor-core`, whose `expect.lint` is `PRIMITIVES_OUT_OF_RANGE` at
`requires.primitives` (found `2`, wanted `≤ 1`).

**Rule two: every refusal fixture names its `code` and its exact `at`**, and the runner asserts the refusal list is
exactly one long. Common keys:

```yaml
code: FIELD_TYPE_UNKNOWN          # UPPER_SNAKE; kebab-case of it is the file name
via:  lint                        # one of seven — the surface that raises it
at:   declarations[0].fields[1].type   # the path 30 §6's Refusal carries, relative to the fixture's input
found: currency                   # optional; asserted when present
```

| `via` | Codes | Input keys | `at` is a path into | Runner |
|---|---|---|---|---|
| `lint` | 22 | `pack:` — a whole manifest | the manifest | `declare/test` — the pack alone, offline |
| `install` | 10 | `pack:` · `installed:` (active declaration bodies) · `facts:` (`rows`, `distinct` values per field, `format`, `primitives` — the numbers the code's message cites) | the manifest | `record/test`, composing `declare`'s plan and `theme`'s checks exactly as `planPack` does |
| `where` | 10 | `register:` · `subject:` (`entry` \| `inbox_raw`) · `predicate:` | the predicate | `record/test` via `where/sql` |
| `write` | 17 | `declare:` (one register) · `rows:` (prior rows, owner-written) · `write:` (`register` `seq?` `patch` `version?`) · `principal:` | `fields.<id>` · `version` · `register` · `state` | `record/test` via the kernel's `write` on a fresh materialised record |
| `rpc` | 8 | `record:` (a seed record) · `call:` (`method` `args`) or `calls:` (a sequence, for `PLAN_STALE`) · `principal:` | `principal` · `args.<k>` · `headers.authorization` | `record/test` |
| `import` | 6 | `record:` · `tamper:` — `sig` · `row` · `format` · `not-empty` · `migration-text` · `migration-ahead`, one per code | `dog_sig.sig` · `dog_manifest.<table>` · `dog_meta.format` · `record` · `migration[<n>]` | `record/test` — export the record, apply the verb, import |
| `render` | 2 | `document:` | `blocks[<i>].rows[<j>]` · `blocks[<i>].kind` | `apps/web/test`, through `braindog-render` |

Seventy-five, counted: 22 + 10 + 10 + 17 + 8 + 6 + 2. The `lint`/`install` split follows each code's own message:
a code that cites rows, installed packs or the record's versions needs a record and is `install`
(`REQUIRED_ON_POPULATED` `ID_RENAMED` `DEPENDENCY_UNRESOLVED` `FORMAT_OUT_OF_RANGE` `FIELD_TYPE_CHANGED`
`SEQ_PREFIX_TAKEN` `MIXED_CURRENCY` `GROUP_BY_CARDINALITY` `QUANTITY_MIXED_UNIT` `CONTRAST_FLOOR`); the other
twenty-two of 04 §5's thirty-three lint offline; `PLAN_STALE` is `rpc`. Two examples:

```yaml
# refusals/row-locked.yaml
code: ROW_LOCKED
via: write
at: fields.lesson
declare:
  register: learnings
  name: Learnings
  fields:
    - { id: lesson, type: text, required: true }
    - { id: state,  type: enum, values: [proposed, active, reverted], default: proposed }
  immutable_when: { field: state, in: [reverted] }
rows:
  - { lesson: "A lesson invented for this fixture, long enough to pass min.", state: reverted }
write: { register: learnings, seq: 1, patch: { lesson: "changed" }, version: 1 }
principal: { kind: person, level: owner }
```

```yaml
# refusals/checksum-mismatch.yaml
code: CHECKSUM_MISMATCH
via: import
at: dog_manifest.entry
record: twelve
tamper: row            # append one byte to the first `entry` line of the exported .dogl; the signature still verifies the manifest
```

---

## 7 · elsewhere
