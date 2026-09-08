# 30 · Blueprint — a fixture, not the document

## 6 · The refusal model

Every document demands refusals that name the field and what was expected. That only stays true if
there is one shape:

```
Refusal {
  code:   'FIELD_TYPE_UNKNOWN'                    -- enumerated, stable, greppable
  at:     'declarations[3].fields[4].type'        -- a path into the thing being validated
  found:  'currency'
  wanted: 'one of the sixteen value types'
  fix:    "Did you mean 'money'?"                 -- one sentence, imperative
}
```

A code is `UPPER_SNAKE`, always. The lower-case forms that appear in other documents — `already_known`,
`wrong_key`, `needs_browser_session`, `human_only` — were the earlier draft, and the table below is the only
list. The storage adapter has its **own** closed vocabulary (`TOO_MANY_PARAMS` and twelve more, §13); it is a
separate list because it names what the *driver* refused, not what the *format* refused.

**One vocabulary, four renderings** — the same pattern as one grammar, seven consumers:

| Surface | Becomes |
|---|---|
| CLI | `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| HTTP | the `Result` envelope, unchanged, and a status that is one function of it — `httpStatus(result)`, shared by both hosts: `422` for **any** refusal (`PLAN_STALE` and `IMPORT_NOT_EMPTY` included — refusals, never 409); `409` for a `conflict` (`VERSION_STALE`; `WRONG_KEY` per [12-SECURITY](12-SECURITY.md) §6.1); `401` with an empty body for `UNAUTHORIZED`; `403` with the envelope for `FORBIDDEN` and `NEEDS_BROWSER_SESSION`; `503` for `SCHEMA_MISMATCH` / `SCHEMA_NEWER`. `X-Request-Id` is echoed |
| MCP | an error result carrying `code` and `fix`, so **the refusal teaches the agent** — [10-MCP](10-MCP.md) §7 rule 4. A call outside its published schema is the protocol's own `-32602`, `message` the fix and `data` `{ at, found, wanted, fix }` — a vocabulary, not a code (below) |
| UI | the sentence, next to the field, plus in the summary — [06-PAGES](06-PAGES.md) §8 |

Two refusal codes exist because of corruption the predecessor shipped, and they **refuse rather than
repair**: `TEXT_JSON_QUOTED` — a string value that arrived wrapped in its own quotes — and
`TEXT_ESCAPED_NEWLINE` — a string containing a literal backslash-n and no real newline. Both reached
the predecessor's record on 2026-08-30 and were invisible on read-back. Repairing would have hidden
the caller's bug; refusing names it.

### The codes

Ninety-nine, counted, in eight families — 41 pack and declaration · 13 grammar · 18 write path · 7 auth and vault ·
6 format and lifecycle · 2 dialect · 5 spark · 7 connector. Every fixture lives at `fixtures/refusals/<name>.yaml`; the
name is the code in kebab-case, and each fixture is keyed by the `via` that raises it — `install`, `lint`, `where`,
`write`, `rpc` and the rest; the split per `via` is the fixtures spec's to count (40 §6), not this table's. *An
earlier draft called the code "enumerated" and enumerated three; the next said seventy-five, and six specs then each
added their own to seventy-five, so the corpus briefly held six totals. Their twenty-four proposals are all accepted
here, once.*

The type `Refusal` (with `RefusalCode`) is a type-only export of `@braindog/ports`, the lowest shared package,
because `where` raises one and sits below the kernel; **this table stays the list's home**, and every package
imports the type — none re-declares it. Two things that look like codes are not: JSON-RPC's `-32602` (a call outside
its published schema, [10-MCP](10-MCP.md) §3) and the `Http` port's four error names — `PrivateRange` · `TooLarge` ·
`Timeout` · `Network` ([33-CONTRACTS](33-CONTRACTS.md) §1) — are **vocabularies**, mapped onto a code where one
applies (`PULL_ORIGIN_REFUSED`) and otherwise never on the wire as a refusal. The adapter's own thirteen (§13) are
the third list, and it stays thirteen.

**Pack and declaration** — refused at install, by `declare`. The first twenty-four are [04-PACKS](04-PACKS.md) §5's
rows, in order; the nine after them are the 2026-09-02 review's; the eight after those are iteration 2's. Seven
write-path codes are raised here too, for the same fact in a declaration's seed or default — `FIELD_UNKNOWN`
`REQUIRED_MISSING` `ENUM_VALUE_UNKNOWN` `OUT_OF_BOUNDS` `REGISTER_UNKNOWN` `INT_OUT_OF_RANGE` `VALUE_MALFORMED` — one
code, two moments (42).

| Code | Raised where | Fixture |
|---|---|---|
| `KIND_UNKNOWN` | 04 §5 | `kind-unknown` |
| `FIELD_TYPE_UNKNOWN` | 04 §5 | `field-type-unknown` |
| `FIELDS_OVER_CAP` | 04 §5; the caps table, 02 §5 | `fields-over-cap` |
| `INDEXES_OVER_CAP` | 04 §5; 02 §5 | `indexes-over-cap` |
| `PATTERN_OVER_CAP` | 04 §5; the 40-byte cap, 02 §6 — measured on the **escaped** `starts`/`ends` literal, and on a `matches` phrase over 200 bytes (38) | `pattern-over-cap` |
| `METRIC_NEEDS_TARGET_OR_WINDOW` | 04 §5; 08 §2 | `metric-needs-target-or-window` |
| `MIXED_CURRENCY` | 04 §5; 08 §4 | `mixed-currency` |
| `CONTRAST_FLOOR` | 04 §5; 28 §4.4 | `contrast-floor` |
| `REQUIRED_ON_POPULATED` | 04 §5; 02 §7 | `required-on-populated` |
| `ID_RENAMED` | 04 §5; 02 §2 | `id-renamed` |
| `COLOUR_OUTSIDE_THEME` | 04 §5; 13 §6 | `colour-outside-theme` |
| `DEPENDENCY_UNRESOLVED` | 04 §5; 04 §2 | `dependency-unresolved` |
| `CREATE_UNBOUNDED` | 04 §5; 07 §6.1 | `create-unbounded` |
| `CREATE_OVER_BOUND` | 04 §5; 07 §6.1 | `create-over-bound` |
| `CREATE_FOREIGN_REGISTER` | 04 §5; 07 §6.1 | `create-foreign-register` |
| `TRANSITION_ILLEGAL` | 04 §5 at install; §4 step 5 at write — one code, two moments | `transition-illegal` |
| `GROUP_BY_TWICE` | 04 §5; 08 §2 | `group-by-twice` |
| `GROUP_BY_CARDINALITY` | 04 §5; 08 §2 | `group-by-cardinality` |
| `RATIO_MIXED_SOURCE` | 04 §5; 08 §2.2 | `ratio-mixed-source` |
| `RATIO_MIXED_CURRENCY` | 04 §5; 08 §2.2 | `ratio-mixed-currency` |
| `QUANTITY_MIXED_UNIT` | 04 §5; 08 §2.2 | `quantity-mixed-unit` |
| `STATE_NOT_ENUM` | 04 §5; 02 §1 | `state-not-enum` |
| `FORMAT_OUT_OF_RANGE` | 04 §5; `requires.format` against `user_version`, §11 | `format-out-of-range` |
| `PRIMITIVES_OUT_OF_RANGE` | 04 §5; `requires.primitives` against `PRIMITIVES_VERSION`, 31 §6 | `primitives-out-of-range` |
| `BAND_EDGES_MISMATCH` | `derive: band` — n edges need n+1 `values:`, 02 §5; 34 §1 | `band-edges-mismatch` |
| `SERIES_HAS_NO_TEXT` | `contains`/`matches`/`starts`/`ends`/`near` over a `series: true` register, 02 §5 | `series-has-no-text` |
| `REQUIRED_WHEN_OP_UNSUPPORTED` | `required_when:` with an operator outside its list, 02 §5 | `required-when-op-unsupported` |
| `PREDICATE_CYCLE` | a named predicate that expands to itself, 02 §5–§6 | `predicate-cycle` |
| `SEQ_PREFIX_TAKEN` | a non-`#` `seq_prefix` already held by an installed register, 02 §2; 34 §4 | `seq-prefix-taken` |
| `SEARCH_FIELD_TYPE` | `search:` naming a field outside `text document enum url email list<text>`, §1 | `search-field-type` |
| `FIELD_TYPE_CHANGED` | a declaration version changing a field's type — retire it and add a new field, 02 §7 | `field-type-changed` |
| `PROVIDES_MISMATCH` | a manifest `provides` that is not the declarations' `kind.id` set, 04 §2 | `provides-mismatch` |
| `PLAN_STALE` | `installPack(pack, planHash)` after the record moved, §5 — a refusal, 422 | `plan-stale` |
| `THEME_VALUE_INVALID` | a theme dialect value outside [28-THEMING](28-THEMING.md) §1's closure — a colour off the grammar, an alpha, an achromatic seed (39) | `theme-value-invalid` |
| `INTENT_INSEPARABLE` | no palette keeps two intents apart by the ΔE floor after dichromat simulation, 28 §3 — searched, never repaired (39) | `intent-inseparable` |
| `THEME_LADDER_ORDER` | a surface or elevation ladder out of order — `sm ≤ md ≤ lg`, L monotonic, 28 §3 (39) | `theme-ladder-order` |
| `PACK_MALFORMED` | not a well-formed pack: a YAML fault, two kinds or two ids in one declaration, a structural rule of 04 §4 (42) | `pack-malformed` |
| `PROVIDES_CONFLICT` | an id another installed pack provides — 04 §2 promised the refusal and coded nothing (42) | `provides-conflict` |
| `REMOTE_ASSET` | a pack asset fetched from elsewhere — a URL, `data:`, a script — 04 §7's enumeration; the one name for the banned-token refusal (42) | `remote-asset` |
| `SECRET_IN_PACK` | a credential inside a pack — 25 §7's enumeration (42) | `secret-in-pack` |
| `WOULD_ORPHAN` | an install that would retire a register with rows under it — 04 §5's downgrade rule; no `--force` in v1 (42) | `would-orphan` |

**Grammar** — refused when a `where:`, an `extract:` form or a connector path is compiled or validated
([34-GRAMMARS](34-GRAMMARS.md) §1, §3, §6); the three at the end are raised at install, by `declare`, before `extract`
ever sees the declaration (42, 43):

| Code | Raised where | Fixture |
|---|---|---|
| `PREDICATE_TOO_DEEP` | a fourth nesting level, §7 | `predicate-too-deep` |
| `VIA_TWICE` | a second `via:` hop, 02 §6 | `via-twice` |
| `VIA_NESTED_SUBQUERY` | a `via:` leaf carrying `matches` or `has`, §7 | `via-nested-subquery` |
| `MONEY_LITERAL_NEEDS_CURRENCY` | a money literal without `currency`, §7 | `money-literal-needs-currency` |
| `QUANTITY_LITERAL_NEEDS_UNIT` | a quantity literal without `unit`, §7 | `quantity-literal-needs-unit` |
| `MATCH_FIELD_UNKNOWN` | a `match:` field outside `from to subject body channel state ts`, 02 §6 | `match-field-unknown` |
| `MATCH_OP_UNSUPPORTED` | the one code for *this test cannot apply here*: `via has near matches starts ends` on the `inbox_raw` backend (02 §6), an operator outside its type's set, `lacks` on a non-list, `near` anywhere but the last leaf (38) | `match-op-unsupported` |
| `CONTAINS_TOO_LONG` | a `contains` literal over 40 bytes, §7 | `contains-too-long` |
| `RELATIVE_LITERAL_UNKNOWN` | a temporal literal outside the anchors and offsets, §7 | `relative-literal-unknown` |
| `RELATIVE_UNIT_FOR_DAY` | an `h` or minute offset against a `day` field, §7 — raised by `declare` on a `remind:`, which the compiler cannot reach, so the fixture has a producer (38) | `relative-unit-for-day` |
| `EXTRACTOR_UNKNOWN` | an `extract:` form key outside the thirteen, 34 §3 (43) | `extractor-unknown` |
| `DATE_FORMAT_INVALID` | a `date` form's `format:` outside its token rules, 34 §3 (43) | `date-format-invalid` |
| `PATH_INVALID` | a response path outside the one `Path` grammar that serves `map`, `read`, `probe`, `expect` and `page.from`, 25 §3 (43) | `path-invalid` |

**Write path** — refused before any row is written (§4); the step is named:

| Code | Raised where | Fixture |
|---|---|---|
| `REGISTER_UNKNOWN` | step 1 — a register not installed, or a bare `#7` with no register before it (41) | `register-unknown` |
| `FIELD_UNKNOWN` | step 1 — also a reserved `_` field, an unknown `predicate:` name, a `via:` target that is not installed; the path and `fix` disambiguate (38, 41) | `field-unknown` |
| `ROW_LOCKED` | step 2, `immutable_when:` | `row-locked` |
| `HUMAN_ONLY` | step 2b, a mechanism actor (`rule:` · `ingest:`) on a person-pinned field — never a token: the literal reading would forbid an agent editing any field a person ever created (41) | `human-only` |
| `TEXT_JSON_QUOTED` | step 3 | `text-json-quoted` |
| `TEXT_ESCAPED_NEWLINE` | step 3 | `text-escaped-newline` |
| `INT_OUT_OF_RANGE` | step 3 — the same code the adapter throws for the same fact (§13) | `int-out-of-range` |
| `VALUE_MALFORMED` | step 3 — a value outside its type's shape that cannot be coerced, an unresolvable id or spoken reference, a non-grant `secret`, an erase subject under three characters; at install too, for a seed (41, 42) | `value-malformed` |
| `REQUIRED_MISSING` | step 4 | `required-missing` |
| `ENUM_VALUE_UNKNOWN` | step 4 | `enum-value-unknown` |
| `OUT_OF_BOUNDS` | step 4, `min:`/`max:` — both bounds named | `out-of-bounds` |
| `IMMUTABLE_FIELD` | step 4, `immutable:` on a changed field; also a derived, retired or kernel-written field (41) | `immutable-field` |
| `UNIQUE_VIOLATION` | step 4, `unique:` on a series row, or from the index as the backstop — driver messages are never parsed (41) | `unique-violation` |
| `ALREADY_KNOWN` | step 4, the `unique:` pre-check, naming the row that already holds the value by its spoken id; also a taken slug at sign-up (41; 51) | `already-known` |
| `REF_REGISTER_MISMATCH` | step 4, a `ref` into a register the field does not declare | `ref-register-mismatch` |
| `DELETE_WHILE_REFERENCED` | step 4, `delete: refuse_while_referenced` as `deleted_at` is set | `delete-while-referenced` |
| `VERSION_STALE` | step 4, the CAS — HTTP 409 | `version-stale` |
| `LEVEL_REQUIRED` | step 5, a transition's `by:` level not held | `level-required` |

**Auth and vault** ([12-SECURITY](12-SECURITY.md) §3, §6):

| Code | Raised where | Fixture |
|---|---|---|
| `UNAUTHORIZED` | no credential, or a bad one — 401, and the body says only this | `unauthorized` |
| `FORBIDDEN` | a credential outside its scope, level or ceiling — 403, §10; a row write from a `spark` principal (41); a runner posting out of `seq` order (46) | `forbidden` |
| `NEEDS_BROWSER_SESSION` | a bearer at VAULT, the session half of JOBS, or ADMIN without an operation grant whose reach names the method — 403, §5 | `needs-browser-session` |
| `WRONG_KEY` | `kek_id` mismatch on open — 409, never "corrupt", 12 §6.1 | `wrong-key` |
| `GRANT_REVOKED` | `openGrant` on a row with `revoked_at` | `grant-revoked` |
| `DEVICE_CODE_EXPIRED` | a poll past the ten-minute life, 12 §6.1 | `device-code-expired` |
| `DEVICE_CODE_TRIES` | the fifth wrong code — every pending row goes `denied` | `device-code-tries` |

**Format and lifecycle** ([03-DOG-FORMAT](03-DOG-FORMAT.md); [33-CONTRACTS](33-CONTRACTS.md) §9):

| Code | Raised where | Fixture |
|---|---|---|
| `FORMAT_NEWER_THAN_READER` | a `user_version` above the reader's, §11 | `format-newer-than-reader` |
| `CHECKSUM_MISMATCH` | `dog_manifest` against the rows; a migration file against its `migration` row | `checksum-mismatch` |
| `SIGNATURE_INVALID` | `dog_sig` against the manifest, 03 §4 | `signature-invalid` |
| `IMPORT_NOT_EMPTY` | `import` into a record that has rows, §5 — a refusal, 422 | `import-not-empty` |
| `SCHEMA_MISMATCH` | a migration checksum the code does not recognise — module-level, every RPC 503 | `schema-mismatch` |
| `SCHEMA_NEWER` | a database migrated past the code — module-level, every RPC 503 | `schema-newer` |

**Dialect** — render-time degradation, never a write refusal ([34-GRAMMARS](34-GRAMMARS.md) §2):

| Code | Raised where | Fixture |
|---|---|---|
| `DIALECT_ARITY` | a row with more cells than its kind takes; names kind and row — a block over its row cap too, `at: "rows"` (36) | `dialect-arity` |
| `DIALECT_KIND_UNKNOWN` | an info string naming no installed kind — `table` inside a write-up included (36) | `dialect-kind-unknown` |

**Spark** — the assistant's own refusals, raised by `spark` before anything is filed ([11-ASSISTANT](11-ASSISTANT.md)
§4; [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §5–§6; [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6):

| Code | Raised where | Fixture |
|---|---|---|
| `PROPOSAL_UNCITED` | a proposal citing a figure or path outside the projection it was given — 23 §5's one hard rule | `proposal-uncited` |
| `PROPOSAL_NO_ROWS` | a proposal over an empty projection, or a body with no citation at all — never filed, 23 §6 | `proposal-no-rows` |
| `PROPOSAL_SCHEMA` | structured output that fails its kind's schema — a tier-C `end.result` included | `proposal-schema` |
| `PREDICTION_UNMEASURABLE` | a `change` body whose prediction names no measurable, or one twelve observations cannot settle in thirty days, 24 §4.6 | `prediction-unmeasurable` |
| `SPARK_BUDGET_SPENT` | an ask past `ask_cap` this month — the meter, 11 §4 | `spark-budget-spent` |

**Connector** — a pull run's refusals, raised by `connect` and acked to the outbox; every one ends the run with a reason
a person reads ([25-CONNECTORS](25-CONNECTORS.md) §5, §7, §9):

| Code | Raised where | Fixture |
|---|---|---|
| `PULL_AUTH_REJECTED` | the provider rejected the credential — 401/403 at token, probe or page; the connector pauses, 25 §9 | `pull-auth-rejected` |
| `PULL_PROVIDER_UNAVAILABLE` | the provider is down — a timeout, the network, an `error_when` status | `pull-provider-unavailable` |
| `PULL_REQUEST_REFUSED` | a 4xx the declaration did not expect; a body over its byte cap | `pull-request-refused` |
| `PULL_EXPECT_FAILED` | an `expect:` assertion failed — the cursor does not advance, 25 §5.1 | `pull-expect-failed` |
| `PULL_SHAPE_MISMATCH` | `read.rows` / `map:` do not fit the page — a non-JSON body, rows that are not a list, a repeated cursor | `pull-shape-mismatch` |
| `PULL_ORIGIN_REFUSED` | the `Http` adapter refused the origin — a private range, size, timeout — or a URL off `base`, 25 §7; the one code the `Http` vocabulary maps onto | `pull-origin-refused` |
| `PULL_LEASE_EDGE` | the run stopped at its lease's edge; `applyPull` on a lease no longer this runner's | `pull-lease-edge` |

And the test that stops the enumeration rotting: **every `code` has a fixture that produces it.** A
code with no fixture fails CI; a refusal path with no code fails review; a code in this table that no
fixture directory carries fails the same gate ([33-CONTRACTS](33-CONTRACTS.md) §8). The gate is one script and a
runner per `via`: the script owns the enumeration — a code per fixture, a fixture per code — and compares it against
the union of the packages' exported code lists, so a family added in a package and not here fails the same way (52).

---


## 7 · After
