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
| HTTP | the `Result` envelope, unchanged, and a status that is one function of it — `httpStatus(result)`, shared by both hosts: `422` for any refusal the exceptions below do not name (`PLAN_STALE` and `IMPORT_NOT_EMPTY` included — refusals, never 409); `409` for a `conflict` (`VERSION_STALE`; `WRONG_KEY` per [12-SECURITY](12-SECURITY.md) §6.1); `401` with an empty body for `UNAUTHORIZED`; `403` with the envelope for `FORBIDDEN` and `NEEDS_BROWSER_SESSION`; `404` for `ROUTE_UNKNOWN` and `400` for `BODY_MALFORMED`, which are the router's own and no method returns; `501` for `NOT_IN_THIS_BUILD`; `503` for `SCHEMA_MISMATCH`, `SCHEMA_NEWER` and `RECORD_UNAVAILABLE`. `X-Request-Id` is echoed |
| MCP | an error result carrying `code` and `fix`, so **the refusal teaches the agent** — [10-MCP](10-MCP.md) §7 rule 4. A call outside its published schema is the protocol's own `-32602`, `message` the fix and `data` `{ at, found, wanted, fix }` — a vocabulary, not a code (below) |
| UI | the sentence, next to the field, plus in the summary — [06-PAGES](06-PAGES.md) §8 |

*The HTTP row said `422` for **any** refusal and then listed five exceptions, which is a sentence that contradicts
itself and — worse — contradicted the tree, where `httpStatus`'s table had grown four more. The exceptions are
enumerated because each is a different INSTRUCTION: 401 says the credential is wrong, 403 that it is the wrong kind
and retrying will never work, 404 that the method does not exist, 400 that the body was never read, 501 that the
declaration is right and the build is behind, 503 that a deploy or an un-suspension fixes it, 409 that somebody got
there first. Everything else is a value the caller can fix, and that is the 422. A code outside §6's table is a code
outside this map: `RECORD_UNAVAILABLE` answered 422 for two months for exactly that reason (53).*

Two refusal codes exist because of corruption the predecessor shipped, and they **refuse rather than
repair**: `TEXT_JSON_QUOTED` — a string value that arrived wrapped in its own quotes — and
`TEXT_ESCAPED_NEWLINE` — a string containing a literal backslash-n and no real newline. Both reached
the predecessor's record on 2026-08-30 and were invisible on read-back. Repairing would have hidden
the caller's bug; refusing names it.

### The codes

One hundred and twelve, counted, in nine families — 47 pack and declaration · 14 grammar · 18 write path · 7 auth and
vault · 8 format and lifecycle · 2 dialect · 5 slash · 7 connector · 4 host and client. Every fixture lives at
`fixtures/refusals/<name>.yaml`; the
name is the code in kebab-case, and each fixture is keyed by the `via` that raises it — `install`, `lint`, `where`,
`write`, `rpc` and the rest; the split per `via` is the fixtures spec's to count (40 §6), not this table's. *An
earlier draft called the code "enumerated" and enumerated three; the next said seventy-five, and six specs then each
added their own to seventy-five, so the corpus briefly held six totals. Their twenty-four proposals are all accepted
here, once.*

*Ninety-nine became a hundred and twelve on 2026-09-08, and the thirteen are named in the rows they sit in. The
occasion was an audit against the tree rather than a wish-list: `refusals.mjs` found **twenty-four codes the source
emits that this table does not have** — twenty-six once its pattern was widened to see past a ternary — and each of the
twenty-six had to be sorted by hand, because the difference between a missing concept, a synonym and a placeholder is a
judgement about a call site and not a rename.*

***Six were renamed onto codes that already existed here**, and that is the repair this table prefers.
`WHERE_UNSUPPORTED` · `WHERE_OPERATOR_UNSUPPORTED` · `OPERATOR_UNSUPPORTED` and a leaf carrying no test at all are five
spellings of `MATCH_OP_UNSUPPORTED`, whose row was already written as the general case rather than `inbox_raw`'s.
`WHERE_MALFORMED` was three facts under one word and is `VALUE_MALFORMED` for an empty `in` and a one-sided `between`,
`RELATIVE_LITERAL_UNKNOWN` for `due before soon`, `MATCH_OP_UNSUPPORTED` for a leaf with no operator.
`RECORD_NOT_EMPTY` is `IMPORT_NOT_EMPTY`. `PERSON_REQUIRED` is `FORBIDDEN`, with the remedy in the sentence where the
other three facts that code carries already keep theirs. **A registry that grows whenever somebody needs a word is not
a closed list**, and these went away by being read rather than by being admitted.*

***Five more were renamed onto three of the new codes**, because the name was wrong about its own subject rather than
redundant: `SCHEMA_UNAVAILABLE` involved no schema; `MALFORMED_FILE` and `IMPORT_FAILED` were two names for one answer
to the caller; `UNIMPLEMENTED` and `NOT_IMPLEMENTED` named nothing at all — not what is unimplemented, not by whom, not
what to do about it, which is a `fix` sentence with a shouty prefix.*

***Ten kept their names and were admitted**, having no equivalent here. They cluster: **six things a declaration can
name and this record has not got** (a page, a metric, a source, a factor table, a factor, a declaration); **three for a
ninth family**, the surface every caller actually talks to; and `REF_UNKNOWN`, which was so nearly a synonym of
`VALUE_MALFORMED` that it WAS renamed onto it — until `declare`'s rule linter turned out to branch on it, which is the
one test that settles whether two refusals are one. Not whether the sentences read alike: whether a caller has to tell
them apart.*

*The ninth family is the hole this audit is proudest of finding. `30 §6` was written about what a record refuses and
never about the boundary a request arrives through, so both hosts and the client each minted a word — `ROUTE_UNKNOWN`,
`BODY_MALFORMED`, `UNREACHABLE`, and a code named after a schema for a record with no owner. That last one, being in no
registry, was in no row of `httpStatus`'s table either, and answered **422** where `49 §5.1` step 5.3 says 503. A code
outside this table is a code outside the status map, which is the concrete cost of an open list and not a stylistic
one.*

*Seven names are still outside, and `refusals.mjs` holds the number as a budget that may only go down.
`DECLARATION_INVALID` is 32 of them and a project of its own; `INTERNAL` is a crash rather than a refusal and is
deliberately not admitted (below); `RECORD_NOT_EMPTY`, `WHERE_OPERATOR_UNSUPPORTED` and `SCOPE_INSUFFICIENT` each have
one straggler site the same change could not reach; and `NOPE` and `SOMETHING_NOBODY_MAPPED` live only in tests, the
second of them as the SUBJECT of its test — "a code nobody enumerated is still a 422" — so replacing it would delete
the assertion. Two of the seven should therefore never go, and the honest floor is two rather than zero.*

*Four documents quote the old total and are not yet amended — [04-PACKS](04-PACKS.md) §5's closing line,
[16-DECISIONS](16-DECISIONS.md) ADR on the enumeration, [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6's fixture row and
[33-CONTRACTS](33-CONTRACTS.md) §8's `refusal-fixtures` row. They say **ninety-nine across eight families**. This table
is the home and they are citations of it, so the repair is theirs and it is named here rather than left to be
discovered: a corpus that briefly held six totals is what the paragraph above is about, and this is how it starts.*

The type `Refusal` (with `RefusalCode`) is a type-only export of `@braindog/ports`, the lowest shared package,
because `where` raises one and sits below the kernel; **this table stays the list's home**, and every package
imports the type — none re-declares it. Two things that look like codes are not: JSON-RPC's `-32602` (a call outside
its published schema, [10-MCP](10-MCP.md) §3) and the `Http` port's four error names — `PrivateRange` · `TooLarge` ·
`Timeout` · `Network` ([33-CONTRACTS](33-CONTRACTS.md) §1) — are **vocabularies**, mapped onto a code where one
applies (`PULL_ORIGIN_REFUSED`) and otherwise never on the wire as a refusal. The adapter's own thirteen (§13) are
the third list, and it stays thirteen.

**Pack and declaration** — refused at install, by `declare`. The first twenty-four are [04-PACKS](04-PACKS.md) §5's
rows, in order; the nine after them are the 2026-09-02 review's; the eight after those are iteration 2's; the last six
are the 2026-09-08 audit's. Seven
write-path codes are raised here too, for the same fact in a declaration's seed or default — `FIELD_UNKNOWN`
`REQUIRED_MISSING` `ENUM_VALUE_UNKNOWN` `OUT_OF_BOUNDS` `REGISTER_UNKNOWN` `INT_OUT_OF_RANGE` `VALUE_MALFORMED` — one
code, two moments (42).

*The family is named for what its codes are ABOUT and not for the moment they are raised, which is what makes room for
the last six: `TRANSITION_ILLEGAL` has said "at install; §4 step 5 at write — one code, two moments" since the first
draft. A page read at 7am and a metric asked for by a `stat` cell are both a caller naming a DECLARATION this record
has not got, which is this family's subject; filing them under the write path — where `REGISTER_UNKNOWN`, their exact
analogue for a register, already sits — would put a read-only refusal in a family whose first line is "refused before
any row is written".*

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
| `DECLARATION_UNKNOWN` | `retire(ids)` naming nothing installed — the one refusal `declare` had no code for, and it was reaching callers as a word invented on the line (53) | `declaration-unknown` |
| `PAGE_UNKNOWN` | a slug no page declaration resolves to, 06 §2 — `allowed` carries the slugs that do, so the answer ends the search rather than starting one (53) | `page-unknown` |
| `METRIC_UNKNOWN` | a `stat` cell, a digest section or `record.metric` naming a metric nobody declared, 08 §2 — **and a metric over a register the caller cannot reach, said in the same words**, because answering `FORBIDDEN` for one that exists and this for one that does not is an enumeration oracle, one probe per guess (45 §13) | `metric-unknown` |
| `SOURCE_UNKNOWN` | a `source:` outside the namespaces this record reads — a metric's, a page block's, a digest section's, 08 §2 — as distinct from `REGISTER_UNKNOWN`, which is the namespace being right and the register not installed; both are raised two lines apart in `metrics.ts` and they are two repairs (53) | `source-unknown` |
| `LOOKUP_UNKNOWN` | a `product:` naming a factor table nobody declared, 08 §2.5 — fix the name | `lookup-unknown` |
| `LOOKUP_MISSING` | the factor table is right and does not cover the data: a `by` value present in the rows with no factor for it, 08 §2.5. **Two codes and not one**, because a row multiplied by one is a wrong number rather than a missing one — the failure that came out 9.25 times too low — and "fix the name" and "add a factor for `yearly`" go to different people; `allowed` lists the values the table does know (53) | `lookup-missing` |

**Grammar** — refused when a `where:`, an `extract:` form or a connector path is compiled or validated
([34-GRAMMARS](34-GRAMMARS.md) §1, §3, §6); three of the four at the end are raised at install, by `declare`, before
`extract` ever sees the declaration (42, 43); the last is raised by the sentence parser and read by `declare` (53):

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
| `REF_UNKNOWN` | a `ref` written by name against a register that holds no row of that name — `thing is Kiln`, 34 §1.1's spoken form. **It is not `VALUE_MALFORMED`**, though that row already reads "an unresolvable id or spoken reference", and the test is not whether the sentences read alike but whether a caller has to tell them apart: `declare` lints every rule's `when:` and survives this refusal and no other, because a name that resolves to nothing today may be written tomorrow while a grammar fault is a fault whenever it is read. Merge them and the exemption swallows a real shape error and installs a rule that fires on nothing, in silence, for ever. Nor is it `REF_REGISTER_MISMATCH`, which resolves to a row of the wrong register — repoint that one; this one has nothing to point at (53) | `ref-unknown` |

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
| `FORBIDDEN` | a credential outside its scope, level or ceiling — 403, §10; a row write from a `slash` principal (41); a runner posting out of `seq` order (46) | `forbidden` |
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
| `FILE_MALFORMED` | a `.dogl` that is not one: no `#dogl` first line, a version that is not a number, a line that is not a row, a row the record cannot hold. **Nothing has been checksummed**, so `CHECKSUM_MISMATCH` would send a person looking for a manifest that was never read, and `33 §9`'s import row names three refusals and had no word for the commonest way a file arrives wrong. Spelled artefact-then-fault like `PACK_MALFORMED` and `VALUE_MALFORMED` (53) | `file-malformed` |
| `NOT_IN_THIS_BUILD` | a declaration that is correct against a document and ahead of the code: one of `08 §2.2`'s eleven aggregations this build does not compute, a `group_by` or `bucket`, a computed page source, an outbox kind this deployment wired no sender for. **The repair is a deploy, not an edit** — which is what `FORMAT_NEWER_THAN_READER` and `SCHEMA_NEWER` already say about a version integer, and why it is filed beside them. It is not `VALUE_MALFORMED`: `median` is a published word, and telling its author it is malformed sends them to check a spelling that is right (53) | `not-in-this-build` |

**Dialect** — render-time degradation, never a write refusal ([34-GRAMMARS](34-GRAMMARS.md) §2):

| Code | Raised where | Fixture |
|---|---|---|
| `DIALECT_ARITY` | a row with more cells than its kind takes; names kind and row — a block over its row cap too, `at: "rows"` (36) | `dialect-arity` |
| `DIALECT_KIND_UNKNOWN` | an info string naming no installed kind — `table` inside a write-up included (36) | `dialect-kind-unknown` |

**Slash** — the assistant's own refusals, raised by `slash` before anything is filed ([11-ASSISTANT](11-ASSISTANT.md)
§4; [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §5–§6; [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6):

| Code | Raised where | Fixture |
|---|---|---|
| `PROPOSAL_UNCITED` | a proposal citing a figure or path outside the projection it was given — 23 §5's one hard rule | `proposal-uncited` |
| `PROPOSAL_NO_ROWS` | a proposal over an empty projection, or a body with no citation at all — never filed, 23 §6 | `proposal-no-rows` |
| `PROPOSAL_SCHEMA` | structured output that fails its kind's schema — a tier-C `end.result` included | `proposal-schema` |
| `PREDICTION_UNMEASURABLE` | a `change` body whose prediction names no measurable, or one twelve observations cannot settle in thirty days, 24 §4.6 | `prediction-unmeasurable` |
| `SLASH_BUDGET_SPENT` | an ask past `ask_cap` this month — the meter, 11 §4 | `slash-budget-spent` |

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

**Host and client** — the boundary itself, raised by `serveApi` and by the client before or after any method runs
([33-CONTRACTS](33-CONTRACTS.md) §4; [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5):

*A ninth family, added 2026-09-08, and the argument for a family rather than four rows scattered across the other
eight is that the other eight are all about the record's CONTENT. This table was written from the inside out — what a
pack may declare, what a predicate may ask, what a write may do — and never once about the surface a request arrives
through, which is the only part of the record most callers ever touch. The consequence was not theoretical: the two
hosts and the client each minted their own word, `httpStatus` grew a table of four codes this document had never
heard of, and `RECORD_UNAVAILABLE` — outside the registry, therefore outside that table — answered 422 for a
record nobody may act on, where `49 §5.1` step 5.3 says 503. There is nowhere among the eight that
"there is no method called `nonsense`" belongs; filing it beside `REF_REGISTER_MISMATCH` would teach a reader that
the groups mean nothing.*

*`INTERNAL` IS DELIBERATELY NOT HERE, and it is the one code in the tree left outside this table on purpose. A
refusal names the field and what was expected; a handler that threw names neither and there is nothing a caller can
fix, so 500 is a crash report wearing the envelope's shape rather than a refusal. Admitting it would make the
registry the list of everything that can appear in a `code`, which is a different and much weaker promise.*

| Code | Raised where | Fixture |
|---|---|---|
| `ROUTE_UNKNOWN` | a path that is not `/api/<method>` for a method in `ROUTES` — 404, and `allowed` carries the method names; also an MCP tool or resource URI that resolves to nothing, 10 §3 (53) | `route-unknown` |
| `BODY_MALFORMED` | a POST body that is not a JSON object — 400, refused before anything reads an argument off it (53) | `body-malformed` |
| `RECORD_UNAVAILABLE` | the record cannot be acted on and it is not the caller's fault: every owner suspended — 503, `49 §5.1` step 5.3. **Named for the record and not for a schema**, which is what it said while borrowing the word from `SCHEMA_MISMATCH` to look like something that earns a 503 (53) | `record-unavailable` |
| `UNREACHABLE` | the client could not reach the record at all — DNS, the socket, a body that is not JSON, an answer carrying neither a refusal nor a conflict. **The one code the record never produces**, and it exists so that a caller told "the record refused" does not go looking for a problem with its arguments while the network is down. It is the inbound half of the same treatment the `Http` vocabulary gets outbound, where four error names map onto the single code `PULL_ORIGIN_REFUSED` (53) | `unreachable` |

And the test that stops the enumeration rotting: **every `code` has a fixture that produces it.** A
code with no fixture fails CI; a refusal path with no code fails review; a code in this table that no
fixture directory carries fails the same gate ([33-CONTRACTS](33-CONTRACTS.md) §8). The gate is one script and a
runner per `via`: the script owns the enumeration — a code per fixture, a fixture per code — and compares it against
the union of the packages' exported code lists, so a family added in a package and not here fails the same way (52).

---


## 7 · After
