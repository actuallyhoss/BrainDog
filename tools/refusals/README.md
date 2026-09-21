# `40 §6`'s `via` runners

A fixture in `fixtures/refusals/` claims three things: a `code`, an address (`at`), and a file that
raises it. `tools/gates/refusal-fixtures.mjs` holds the corpus to the first and the third by reading
text. Nothing read the second until a runner existed, and nothing at all drove the surface and looked
at what came back.

`run-via.mjs` is that runner, for two `via`s so far:

```
node --experimental-strip-types tools/refusals/run-via.mjs lint
node --experimental-strip-types tools/refusals/run-via.mjs where
node --experimental-strip-types tools/refusals/run-via.mjs where --json
node --experimental-strip-types tools/refusals/run-via.mjs rpc     # says what a driver would need
```

Exit 0 when every fixture agreed with its surface, 1 when one did not, 2 when this runner drove
nothing at all.

## Two of the nine runners already existed

`loop/STATUS.md` §5 and `docs/40-SPEC-FIXTURES.md` §6 both say none of the eight exists. Both are
stale by one day. `e74a563b`, *"The first two via runners, so a fixture is driven instead of merely
counted"*, Sunday 20 September 2026, added:

| `via` | Fixtures | Runner |
|---|---|---|
| `write` | 15 | `packages/kernel/test/refusals-write.test.ts` |
| `render` | 2 | `apps/web/test/refusals-render.test.ts` |

Both drive their surface for real and both compare the address. They share one reader,
`fixtures/corpus.ts`, and this runner uses the same one. So the gap was never "nothing drives a
fixture"; it was that seven of the nine vias had no driver and nothing said which, or what each one
would cost.

## Why `lint` was built third

Counted from the corpus on 21 September 2026, `grep -h '^via:' fixtures/refusals/*.yaml | sort |
uniq -c`:

| `via` | Fixtures | State |
|---|---|---|
| `rpc` | 30 | no driver |
| `lint` | **27** | **driven here** |
| `install` | 20 | no driver |
| `write` | 15 | driven in `packages/kernel/test` |
| `where` | **7** | **driven here**, since the fourth runner below |
| `pull` | 7 | no driver |
| `import` | 7 | no driver |
| `ask` | 4 | no driver |
| `render` | 2 | driven in `apps/web/test` |

`rpc` is bigger by three and needs a seeded record, a principal and a method table. `lint` is the
largest family whose surface is a pure function: `validate()` in `packages/kernel/src/declare.ts` is
synchronous and takes one declaration, and `normalise()` in `packages/declare/src/index.ts` is one
`await` over one document. No SQLite, no record, no HTTP, no clock. Measured over three runs of the
whole 27-fixture family, cold process included: 258 ms, 236 ms, 247 ms.

Of the 27, 22 name `packages/kernel/src/declare.ts` in `raises:`, 4 name
`packages/declare/src/index.ts` and 1 names `packages/declare/src/shared.ts`. The runner drives those
three files and not `@braindog/record` above them, which is the call `refusals-write.test.ts` made
first and the right one: a runner a layer above the raiser goes green the day the layer between them
starts answering for itself.

A pack is linted here the way `lintBatch` lints a batch with no record behind it. `normalise` first,
because that is what turns a stranger's document into declarations at all, then `validate` per
declaration with `known` and `owners` built from the batch alone, which is all `knownTo` and
`ownersTo` have to overlay when the `declaration` table is empty.

## What it found

**26 of 27 agreed, and every one of the 27 addresses is right.** This is the first time a `lint`
fixture's `at` has been compared against a real refusal, and the corpus came through it. `40 §6`
records twelve `write` and `rpc` fixtures that carried an `at` prefix no refusal has ever contained,
which is the outcome this comparison exists to prevent; that count is read off that page and was not
re-measured here.

**`create-foreign-register.yaml` says `via: lint` and cannot be reached from a pack.** The check at
`packages/kernel/src/declare.ts:2428` reads `owners.get('register.' + spec.register)` and refuses
only when that answers a pack id that differs from the rule's own. With no record behind the lint,
`owners` holds nothing but the batch, so a rule creating into a register the pack does not declare
gets `undefined` and installs clean. Measured directly against `validate`:

```
owners EMPTY  -> null
owners SEEDED -> CREATE_FOREIGN_REGISTER at register,
                 "rule.spawn-invoices writes register.invoices, declared by freelancer-uk."
```

So the code is right and the fixture's `via` is wrong. `40 §6`'s own split rule decides it: *"a code
that cites rows, installed packs or the record's versions needs a record and is `install`"*, and this
refusal's sentence names an installed pack. The fixture belongs in the `install` family, which moves
the split from 27 + 20 to 26 + 21.

**Two of the 27 codes need an input key `40 §6`'s `lint` row has not got.** The row names one,
`pack:`. Measured:

- `PACK_OVER_CAP` is raised in exactly one place, `packages/declare/src/shared.ts:62`, inside
  `readShared`, which weighs a `.usecase.json` file against `SHARED_MOST_BYTES`. `normalise` holds no
  size cap at all, so no manifest can raise it. The fixture needs a `usecase:` body.
- `KIND_UNKNOWN` is raised by `validate` for a kind outside the eight, and `normalise` refuses such a
  declaration as `PACK_MALFORMED` at `declarations` before `validate` sees it. A pack is the one
  input that cannot carry it. The fixture needs a bare `decl:` body.

The runner reads all three keys for that reason, and `40 §6`'s `lint` row should name all three.

## The inputs are not in the fixtures yet

Re-measured over the corpus on 21 September 2026 rather than read off `40 §6`: 17 of the 119 fixtures
carry an input body, and the only input keys present anywhere are `declare:` on 15, `write:` on 15,
`rows:` on 13 and `document:` on 2, so all 17 are `write` or `render`. Every fixture carries `code`,
`via`, `raises` and `fix`; 111 of 119 carry an `at`. None of the 27 `lint` fixtures carries a `pack:`.
So the bodies sit in
`lint-inputs.json` beside this file, keyed by fixture file name, and the runner falls back to them
and marks every line it borrows `(borrowed)`. A fixture that passes on somebody else's input is still
a fixture with no input.

**What to fold where.** For each of the 27 entries in `lint-inputs.json`, add one key to the fixture
of the same name, as a YAML flow collection over several lines with every continuation indented,
which is the form `fixtures/corpus.ts` reads and `refusal-fixtures.mjs` skips:

- 25 entries become `pack: { … }`.
- `pack-over-cap.yaml` becomes `usecase: "…"`, a document over 256 KB.
- `kind-unknown.yaml` becomes `decl: { … }`, one declaration outside the eight kinds.

Then delete `lint-inputs.json` and the `borrowed` path in `run-via.mjs`, and the runner reads the
corpus alone. Two entries are worth a decision rather than a paste: `fields-over-cap.yaml` needs 65
fields to reach `FIELD_CEILING` and `pack-over-cap.yaml` needs a 256 KB string, so both are large
fixtures by necessity rather than by carelessness.

**`lint-inputs.json` is here and not beside the corpus because the gate refuses it there.**
`tools/gates/refusal-fixtures.mjs:304` pushes a finding for every entry in `fixtures/refusals/` whose
extension is not `.yaml`, and a finding sets `process.exitCode = 1`. A `README.md` in that directory
would turn the enumeration gate red for the same reason, which is why the notes for the corpus are in
this file instead.

## Adding the next driver

A driver is one async function, `(input, fixture) => Envelope`, where `Envelope` is
`{ kind, code?, at?, fix? }` and `kind` is `refusal`, `conflict` or `accepted`. Nothing else in
`run-via.mjs` knows what a pack or a predicate is. Register it in `DRIVERS` under its `via` and the
comparison, the reporting and the exit codes are already there.

`DRIVERS` holds a sentence instead of a function for the seven that have none, and the sentences are
not interchangeable. `import` is the cheapest of the six genuinely unbuilt: `tamper:` is one word per
code and `record:` is a seed name, so its seven fixtures need two scalar lines each rather than a
hand-written body. `rpc` is the largest and the most expensive. `install` needs everything `lint`
needs plus a materialised record, which is why the two families are split at all.

## What the runner asserts

- The surface refused. An accepted input is a failure, because a fixture is a refusal.
- `code` is exactly the fixture's `code`.
- `at` is exactly the fixture's `at`, and a fixture with no `at` claims the refusal has none. `40 §6`
  made the key optional on 20 September 2026 after a required one bought nine invented addresses, so
  silence is a claim.
- `fix` is a sentence: not empty, ending in terminal punctuation.

The `fix` is not compared against the fixture's own `fix:`, and that is deliberate. A fixture's `fix`
is the reader's summary of the repair; the surface's quotes the caller's own values back, so the two
are different strings on purpose. `30 §6`'s whole requirement of a `fix` is that it is a sentence.
`refusals-write.test.ts` made this call first and this runner keeps it.
