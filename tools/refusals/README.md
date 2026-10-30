# `40 §6`'s `via` runners

A fixture in `fixtures/refusals/` claims three things: a `code`, an address (`at`), and a file that
raises it. `tools/gates/refusal-fixtures.mjs` holds the corpus to the first and the third by reading
text. Nothing read the second until a runner existed, and nothing at all drove the surface and looked
at what came back.

`run-via.mjs` is that runner, for `lint`, `where` and `rpc`:

```
node --experimental-strip-types tools/refusals/run-via.mjs lint
node --experimental-strip-types tools/refusals/run-via.mjs where
node --experimental-strip-types tools/refusals/run-via.mjs where --json
node --experimental-strip-types tools/refusals/run-via.mjs rpc        # and names what it cannot drive
```

Exit 0 when every fixture agreed with its surface, 1 when one did not or was not driven, 2 when
this runner drove nothing at all.

## Where each `via` stands

Every one of the nine has a driver. The fixtures behind each are counted with
`grep -h '^via:' fixtures/refusals/*.yaml | awk '{print $2}' | sort | uniq -c`, and the sizes are not written here,
because they move with the corpus.

| `via` | Driven by |
|---|---|
| `rpc` | `run-via.mjs rpc`, through `rpc.mjs`, against a self-host over a socket; each fixture it cannot drive is printed with its reason (`SCENES` in `rpc.mjs`). Three slices are also held beside their raisers: `packages/host/test/refusals-rpc.test.ts`, `apps/selfhost/test/refusals-rpc.test.ts` and `packages/client/test/refusals-rpc.test.ts` |
| `lint` | `run-via.mjs lint` |
| `install` | `packages/record/test/refusals-install.test.ts`: every fixture but the three theme codes, skipped by name because nothing on the install path calls `theme`'s checks |
| `write` | `packages/kernel/test/refusals-write.test.ts` |
| `where` | `run-via.mjs where` |
| `pull` | `packages/connect/test/refusals-pull.test.ts` for the ones raised in `packages/connect`, and `packages/host/test/refusals-pull.test.ts` for the ones raised in `packages/host/src/actions.ts` |
| `import` | `packages/kernel/test/refusals-import.test.ts` |
| `ask` | `packages/slash/test/refusals-ask.test.ts` |
| `render` | `apps/web/test/refusals-render.test.ts` |

`run-via.mjs <via>` names the runner of every via it does not drive itself (`DRIVERS` there). The sections below
say how each runner came to be, in the order they were built, and every count in them is the count of its day.

## Two of the nine runners already existed

`docs/40-SPEC-FIXTURES.md` §6 said none of the eight existed, a day after two did. `e74a563b`, *"The first two via runners, so a fixture is driven instead of merely
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
uniq -c`, and each via's state that day (the table above is today's):

| `via` | Fixtures | State on 21 September |
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

## Why `where` was built fourth

Same rule as the third, applied to what was left: the largest family whose surface is a pure
function. After `lint` there is exactly one, and it is `where`.

Counted from the corpus again on 21 September 2026, the six vias with no driver anywhere are `rpc`
(30), `install` (20), `where` (7), `pull` (7), `import` (7) and `ask` (4). Five of the six need a
materialised record before they can answer at all: `install` composes `declare`'s plan against rows,
distinct values and format numbers; `rpc` seeds a record and a principal; `import` exports a record,
tampers with the file and imports it; `pull` drives a scheduled connector run; `ask` runs the
inference double. `where` needs neither a record nor a clock it does not own, and its harness is two
exported functions:

- `compile(predicate, schema)` in `packages/where/src/index.ts` is synchronous and answers
  `{ sql, params, bad }`, where `bad` is the refusal list. No SQLite, no HTTP, no I/O of any kind.
- `parseWhere(text, schema, deps)` in `packages/where/src/sentence.ts` is synchronous too, and its
  `deps` are a number and one callback.

Measured rather than asserted, in process, five passes over the whole seven-fixture family:

```
@braindog/where + corpus module graph: 36.5 ms
reading all 119 fixtures off disk:      9.8 ms
driving the 7 where fixtures:           1.93 / 0.12 / 0.09 / 0.07 / 0.06 ms
```

So the family costs 0.06 ms warm, and 0.1 ms of modules on top of what the runner already loads,
because `packages/kernel/src/declare.ts` imports `@braindog/where` and the `lint` driver's own import
chain has therefore already paid for it:

```
lint's chain (declare + kernel/declare): 151.7 ms
where's chain, after it:                 0.1 ms
```

Wall clock for `run-via.mjs where` is 258 / 285 / 271 ms across three cold runs, which is the same as
`lint`'s 258 / 246 / 277 ms and is process start and type stripping in both. Nothing in this family
is measurable against the process that hosts it.

**Seven fixtures against thirty is the trade, and the answer is still `where`,** because `rpc`'s cost
is not its size. Its 30 fixtures need `record:`, `call:` or `calls:` and `principal:` written by hand
for each, a seeded record behind every one, and a method table; the input bodies are the work and the
count multiplies it. `where` needs a register declaration and a predicate per fixture, against a
surface that cannot fail for an environmental reason, so all seven were folded and driven in one
sitting. A runner that drives seven fixtures today beats one that would have driven thirty next week.

**It drives the two files the fixtures name in `raises:`,** which is the call the write runner made
first and the `lint` runner kept. Six of the seven name `packages/where/src/index.ts` and one names
`packages/where/src/sentence.ts`. Nothing above them is touched: `predicateOf` in
`packages/kernel/src/metrics.ts` is the production dispatcher over both forms and `unreadWhere` in
`packages/kernel/src/index.ts` is what calls it, and a runner up there goes green the day either
starts answering for itself.

**The order is `parseWhere` then `compile`, which is `unreadWhere`'s order and its own paragraph.**
Parsing resolves the relative dates and compiling is what "can be read" means, and that file records
what happened when only one of the two ran: the same mistake was refused written as a sentence and
installed written as a tree. One exception there is deliberately **not** copied. `unreadWhere` skips a
`REF_UNKNOWN` because `owner is Kiln` may name a row somebody writes tomorrow and a rule is being
installed; that is a fact about install, and copying it here would make `ref-unknown.yaml` the one
`where` fixture the runner is built to discard.

**`register:` is read the way `schemaOf` reads an installed register,** at
`packages/kernel/src/index.ts:1094`, and not as a convenient subset of it. Every key that mapping
carries is there because leaving it out broke something the kernel records in place: `state` because
one shipped register mirrors a field called `lane`, `series` because `02 §5`'s rule against text over
a series was kept by nothing until the flag travelled, `of` because a `has` over a `list<ref>` without
it searches a column of row ids for a title. It is copied rather than called because `schemaOf` is a
closure inside `makeKernel`, reachable only through `openRecord`, which is the SQLite record this
family exists to not need. The kernel keeps a second copy of the same mapping at `unreadable`'s
`shape()` (`index.ts:1256`) for a register arriving in a batch with no record behind it, which is
exactly this situation; that copy omits `state`, so this one follows `schemaOf` and not it.

## What the `lint` runner found

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
the split from 27 + 20 to 26 + 21, or from today's 32 + 15 to 31 + 16 now that the five below have
moved the other way.

**Five `install` fixtures were `lint` all along, and now say so.** `ACTION_NOT_HTTPS`,
`ACTION_HOST_COMPUTED`, `ACTION_GRANT_MISSING`, `ACTION_INTERVAL_TOO_SHORT` and `ACTION_EVALUATES` are
raised by `actionFault` in `packages/kernel/src/declare.ts`, which `validate()` calls, and which reads
the record only for a `sends:` check none of the five uses. They had been measured against
`validate` alone; that is not the `lint` driver's order, so on 22 September 2026 each was
refiled as `via: lint` with its own `pack:` (one register, one `poll` or `call` declaration) and put
through `normalise` first. None was refused by `normalise`, and all five answer their own code at their
own address:

```
action-evaluates.yaml           ACTION_EVALUATES at body.text
action-grant-missing.yaml       ACTION_GRANT_MISSING at grant
action-host-computed.yaml       ACTION_HOST_COMPUTED at url
action-interval-too-short.yaml  ACTION_INTERVAL_TOO_SHORT at every
action-not-https.yaml           ACTION_NOT_HTTPS at url
31/32 agreed with the surface; 27 ran on a borrowed input.
```

Each pack is one fault away from clean, which was checked rather than hoped: with the one bad value
put right (an `https://` url, a written host, a named grant, `every: 1h`, a body with only `{until}`
in it), all five lint clean through the same `normalise` and `validate`. So no fixture agrees because
some other check happened to fire first. The red came first too: with `via:` changed and no `pack:`
yet, the run read `26/32 agreed` at exit 1, the five saying *"carries no input, so nothing drives it"*.
The one disagreement left is `create-foreign-register`, above. `run-via.mjs install` now reads
*"install: 15 fixtures, and this runner drove none of them"* at exit 2.

**And `create-foreign-register` has moved, so `lint` agrees with itself.** Later on 22 September 2026
the fixture became `via: install` with its own `pack:` and an `installed:` holding the pack that owns
`invoices`, and its entry here in `lint-inputs.json` was deleted, because a lending nothing borrows is
dead data. `run-via.mjs lint` reads `31/31 agreed with the surface; 26 ran on a borrowed input.` at
exit 0. What the move found is in the next section.

**Two of the 27 codes need an input key `40 §6`'s `lint` row has not got.** The row names one,
`pack:`. Measured:

- `PACK_OVER_CAP` is raised in exactly one place, `packages/declare/src/shared.ts:62`, inside
  `readShared`, which weighs a `.usecase.json` file against `SHARED_MOST_BYTES`. `normalise` holds no
  size cap at all, so no manifest can raise it. The fixture needs a `usecase:` body.
- `KIND_UNKNOWN` is raised by `validate` for a kind outside the eight, and `normalise` refuses such a
  declaration as `PACK_MALFORMED` at `declarations` before `validate` sees it. A pack is the one
  input that cannot carry it. The fixture needs a bare `decl:` body.

The runner reads all three keys for that reason, and `40 §6`'s `lint` row should name all three.

## What the `where` runner found

**7 of 7 agreed, and every one of the seven addresses is right.** This is the first time a `where`
fixture's `at` has been compared against a real refusal, and the family came through it whole. What
the surface answered, in full:

```
contains-too-long.yaml             CONTAINS_TOO_LONG at what
match-op-unsupported.yaml          MATCH_OP_UNSUPPORTED at what
money-literal-needs-currency.yaml  MONEY_LITERAL_NEEDS_CURRENCY at amount
predicate-too-deep.yaml            PREDICATE_TOO_DEEP at all
quantity-literal-needs-unit.yaml   QUANTITY_LITERAL_NEEDS_UNIT at effort
ref-unknown.yaml                   REF_UNKNOWN at thing
series-has-no-text.yaml            SERIES_HAS_NO_TEXT at campaign
```

**No fixture in this family is wrong.** The third runner found two fixture faults in 27, so a reader is
entitled to wonder whether a run with no findings ran; the red is below, and one code defect the run
turned up is the item after next.

**Each of the seven answers exactly one refusal,** which is `40 §6`'s rule two and was worth measuring
rather than assuming, because `compile` walks the whole predicate and collects. The seven sentences the
surface produced, which the runner checks for terminal punctuation and nothing else:

```
what contains takes at most 40 bytes, and this one is 41.
what is a text, which cannot be asked "before".
amount is money, so this comparison needs a currency: { amount, currency }. Without one it
  matches every currency in the register.
A predicate nests 3 groups deep, counting the outermost as the first. Flatten it.
effort is a quantity, so this comparison needs a unit: { value, unit }. Without one it matches
  every unit in the register.
thing is Kiln: there is no things called Kiln.
campaign: contains over readings, which is series: true. A series has no text; filter readings
  on its key fields or its numbers.
```

**`REF_UNKNOWN` IS UNGRAMMATICAL ON EVERY REGISTER IN THE RECORD, and that is the code and not the
fixture.** `packages/where/src/sentence.ts:680` builds the sentence as
`` `${sentence}: there is no ${decl.to ?? 'row'} called ${said}.` ``, and `decl.to` is a register **id**.
Register ids are plural by convention and in practice: every `to:` target in the shipped seed is one
(`accounts`, `categories`, `courses`, `cycles`, `goals`, `learnings`, `milestones`, `obligations`,
`organisations`, `people`, `savings_goals`, `tasks`, `things`, `tracks`, `updates`). So a person who
writes `thing is Kiln` reads *"there is no things called Kiln"*, and would read *"there is no people
called Ada"* and *"there is no obligations called Invoice 41"* on the two commonest refs in the seed.
It is not reachable from the tree form, so the only people who see it are the ones writing the grammar
in words, which is the surface `38 §1` puts *for people*.

The runner cannot catch this and should not be taught to: its `fix` check is `30 §6`'s, that a `fix` is
a sentence, and *"there is no things called Kiln"* is a sentence. What it needs is a singular or a
display name, and `Schema` carries neither: `RegisterDecl` has a `name`, `schemaOf` does not copy it,
and `where` is handed a register id and a field map. So the repair is a key on the schema and a mapping
that sends it, which crosses `packages/kernel` and `packages/where` and is a decision rather than a
typo. Nothing here touches either file, and the fixture's own claim, `REF_UNKNOWN at thing`, is right.

**`ref-unknown.yaml` cannot be driven from the tree form at all,** and that is what decided the shape
of `predicate:`. `REF_UNKNOWN` is raised in exactly one place, `packages/where/src/sentence.ts:679`,
which is the fixture's own `raises:`; `compile` never raises it and has no branch that could, because
resolving a name to a row id is what the sentence parser does and the tree form carries the id
already. So the one input key `40 §6` gives this family has to carry both renderings of the grammar,
and the runner reads a flow collection as the tree and a plain scalar as the sentence. That is the
same first-character test `fixtures/corpus.ts` already applies when it reads the file, and the record
itself takes both through one function (`predicateOf`), so it is one key in the fixture for the same
reason it is one parameter in production.

**The `at` this family answers is a name and not a path, on all seven.** `40 §6`'s table heads that
column *"`at` is a path into"* and gives `where` *"the predicate"*. Measured: six of the seven answer
a field id (`what` on two of them, then `amount`, `effort`, `thing`, `campaign`) and the seventh a quantifier word
(`all`, the key of the group that overflowed). None is a path, and nothing in `packages/where/src`
builds one: `refuse(code, fix, at)` is handed a field id or an operator key at every one of its call
sites. The fixtures are right and the surface is right; the column promises an address shape this
family has never had, which is the same discovery `40 §6` already recorded for `render` and is a
change to that page rather than to anything here.

**One code in seven has ten emitters, and the fixture's `at` is what pins which one.** Counted:
`MATCH_OP_UNSUPPORTED` is constructed six times in `packages/where/src/index.ts` and four times in
`sentence.ts`; `SERIES_HAS_NO_TEXT` twice; the other five once each. `match-op-unsupported.yaml`
claims `at: what`, a field id, which rules out the emitters addressed to an operator key
(`matches`, `near`, `predicate`, `via`, and the seven `34 §1.9` refuses over an arrival) and leaves the
two addressed to a field. Its input reaches the second of those, `index.ts:890`, the one that answers
*"what is a text, which cannot be asked before"*. `series-has-no-text.yaml` claims `at: campaign` for
the same reason and reaches `index.ts:900`, `38 §5.3`'s L19, rather than the `matches`/`near` emitter
above it. A fixture pins one emitter of a code, not the code, and the address is the whole of how.

**`subject:` is a documented key that no fixture in the corpus uses.** `40 §6` gives this family
`register:`, `subject:` (`entry` or `inbox_raw`) and `predicate:`, and all seven fixtures are about
`entry`, which `Schema.subject` makes the default. The runner implements the `inbox_raw` branch anyway
and hands over `INBOX_RAW` from `packages/where/src/index.ts:295`, because a runner that ignored the
key would report the first fixture to use it as a disagreement about its own code. Nothing in the
corpus reaches `34 §1.9`'s seven words refused over an arrival, and that is a coverage gap rather than
a defect.

**All thirteen codes this package raises have a fixture, and the seven are exactly the seven whose
raiser is this package.** The other six (`ENUM_VALUE_UNKNOWN`, `FIELD_UNKNOWN`, `MIXED_CURRENCY`,
`PATH_INVALID`, `REQUIRED_MISSING`, `VALUE_MALFORMED`) are each filed against the kernel's own emitter
of the same code, under `write`, `rpc` or `lint`, and no fixture outside this family names
`packages/where/src` in `raises:`. So the split is consistent in both directions, which is the one
thing about this family that could have been wrong on paper and is not.

### What was watched failing

The family ran green on the first pass, so the comparison was proved against a deliberately wrong
claim rather than against a repair. An eighth fixture was added carrying `at: amount` for a refusal
the surface addresses to `what`, and a predicate tripping two checks instead of one:

```
  FAIL zz-temporary-red-proof.yaml
       was refused 2 times over and 40 §6 asks for one: also FIELD_UNKNOWN
       claims at amount and the surface answered at what
7/8 agreed with the surface; 0 ran on a borrowed input.
EXIT=1
```

Then the same file with a legal YAML flow collection that is not JSON, `{ field: what, contains:
yaml-but-not-json }`, which is the shape a review of the third runner found taking a whole run down:

```
  FAIL zz-temporary-red-proof.yaml
       its own input is unreadable: Expected property name or '}' in JSON at position 2 (line 1 column 3)
7/8 agreed with the surface; 0 ran on a borrowed input.
EXIT=1
```

The containment holds for the second family: seven answers survived the eighth fixture's unreadable
input. The file was deleted, and `where` is 7 of 7 at exit 0. Before the driver existed the same
command printed *"where: 7 fixtures, and this runner drove none of them"* and exited 2.

**A misspelt `subject:` went green, and that was found by checking the guard beside it.** The driver
says a missing `register:` in words; nothing said anything about a `subject:` outside `40 §6`'s two
values. `contains-too-long.yaml` rewritten with `subject: inbox-raw`, a hyphen where the underscore
belongs, fell through to the `entry` branch, was driven against its own register, and printed:

```
  ok   contains-too-long.yaml
7/7 agreed with the surface; 0 ran on a borrowed input.
```

A fixture claiming a subject the grammar does not have and going green is the one outcome this runner
exists to stop, and the gate could not catch it either: `refusal-fixtures.mjs` reads `40 §6`'s
Input-keys column for key NAMES, so `subject:` is allowed and its value is never looked at. The
driver now refuses the value, and the same file says so:

```
  FAIL contains-too-long.yaml
       carries `subject: inbox-raw`, and 40 §6 names entry and inbox_raw
6/7 agreed with the surface; 0 ran on a borrowed input.
EXIT=1
```

`subject: entry` written out still drives against the register, which is `Schema.subject`'s own
default said aloud, and the family is 7 of 7 at exit 0 with the file restored.

**The one-refusal check is new and it is `40 §6`'s rule two,** whose `record/test` row says
*"refusals.length === 1"* in as many words. `compile` answers with a list, so a fixture can agree on
`bad[0]` while a second check it never meant to trip sits behind it, and the day the first check moves
the fixture starts testing the second silently. No fixture in the corpus trips it; the red above is
the only thing that has.

## The `where` family's inputs are in the fixtures

Unlike `lint`, this family borrows nothing. All seven `register:` and `predicate:` bodies were folded
into the fixture files as YAML flow collections, so `borrowed(via)` answers an empty map for `where`
and there is no second lending file. That was possible because the folding and the driver landed
together; the third runner's bodies sit beside it because that runner did not own `fixtures/refusals`.

Two things held the folding to the format rather than to convenience. `40 §6`'s three keys are all
three a `where` fixture may carry: `tools/gates/refusal-fixtures.mjs:347` builds the allowed set from
that table's Input-keys column per `via` and pushes a finding for anything else, so `series: true`
arrives inside `register:` and a sentence arrives as `predicate:`, not as keys of their own. Replayed
that gate's own regex over the whole 119-fixture corpus after the fold: nine vias read, `where` allows
`register subject predicate`, no key findings. And `40 §6`'s rule one says every inline declaration in
a fixture lints clean, so all seven `register:` bodies were put through `normalise` and `validate` as a
one-declaration pack, the way the `lint` driver does it:

```
contains-too-long.yaml: LINTS CLEAN            predicate-too-deep.yaml: LINTS CLEAN
match-op-unsupported.yaml: LINTS CLEAN         quantity-literal-needs-unit.yaml: LINTS CLEAN
money-literal-needs-currency.yaml: LINTS CLEAN ref-unknown.yaml: LINTS CLEAN
series-has-no-text.yaml: LINTS CLEAN
```

`register:` is spelled with an `id`, as `write`'s `declare:` is, because it is the body of an installed
register and that is what `schemaOf` is handed. A pack manifest spells the same declaration
`register: <id>`, which is why the lint check above renames it before building the pack.

## The `lint` inputs are not in the fixtures yet

Re-measured over the corpus on 21 September 2026 rather than read off `40 §6`, before the `where` fold
above: 17 of the 119 fixtures carried an input body, and the only input keys present anywhere were
`declare:` on 15, `write:` on 15, `rows:` on 13 and `document:` on 2, so all 17 were `write` or
`render`. Every fixture carries `code`, `via`, `raises` and `fix`; 111 of 119 carry an `at`. The fold
takes that 17 to 24 and adds `register:` on 7 and `predicate:` on 7; none of the 27 `lint` fixtures
carries a `pack:` still. So the bodies sit in
`lint-inputs.json` beside this file, keyed by fixture file name, and the runner falls back to them
and marks every line it borrows `(borrowed)`. A fixture that passes on somebody else's input is still
a fixture with no input.

**What to fold where.** For each of the 26 entries in `lint-inputs.json`, add one key to the fixture
of the same name, as a YAML flow collection over several lines with every continuation indented,
which is the form `fixtures/corpus.ts` reads and `refusal-fixtures.mjs` skips:

- 24 entries become `pack: { … }`.
- `pack-over-cap.yaml` becomes `usecase: "…"`, a document over 256 KB.
- `kind-unknown.yaml` becomes `decl: { … }`, one declaration of no kind `KINDS` lists (`packages/kernel/src/declare.ts`).

Then delete `lint-inputs.json` and the `borrowed` path in `run-via.mjs`, and the runner reads the
corpus alone. Two entries are worth a decision rather than a paste: `fields-over-cap.yaml` needs 65
fields to reach `FIELD_CEILING` and `pack-over-cap.yaml` needs a 256 KB string, so both are large
fixtures by necessity rather than by carelessness.

**`lint-inputs.json` is here and not beside the corpus because the gate refuses it there.**
`tools/gates/refusal-fixtures.mjs:304` pushes a finding for every entry in `fixtures/refusals/` whose
extension is not `.yaml`, and a finding sets `process.exitCode = 1`. A `README.md` in that directory
would turn the enumeration gate red for the same reason, which is why the notes for the corpus are in
this file instead.

## What the `install` runner found

The `install` family is driven by `packages/record/test/refusals-install.test.ts` and not from this
file, for the reason `write` is: `40 §6` puts it in `record/test`, and five of its thirteen need a
SQLite record. Every fixture in the family is driven; the three that name `packages/theme/src/checks.ts`
go through a real record, whose `planPack` reads every pack through `packages/record/src/theme-check.ts`.
The test asserts the count, so a new one arrives red until it is counted. Each fixture carries its own `pack:`, `installed:` (the packs already on the record, each a whole
manifest) and `facts:` (`rows`, `format`, `primitives`, `disabled`); nothing is borrowed, so there is
no `install-inputs.json` and there should not be one.

**Two drivers, chosen by `raises:`.** The eight that name `packages/declare/src/index.ts` go through
`plan` and `install` over an `Installed` the test builds from `installed:` and `facts:`, with a `Host`
that stages nothing, because every refusal `install` owns is decided before `stage` is called. The five
that name the kernel go through a real record: `createRecordApi` over `openSqlite()`, `installed:`
through `planPack` and `installPack`, `facts.rows` written as rows, `facts.disabled` through
`disablePack`, then `pack:` planned and installed. The pure half is not a shortcut:
`FORMAT_OUT_OF_RANGE` and `PRIMITIVES_OUT_OF_RANGE` cite numbers a real record has exactly one of,
and only a built `Installed` can hold another.

**The pure half needed `40 §6`'s rule one written into it, measured.** `plan` never asks whether an
installed body is legal, and the first draft of `field-type-changed` and `required-on-populated`
declared `"type": "number"`, which is no field type. Both agreed through the pure driver. Put through a
real record, their `installed:` was refused `FIELD_TYPE_UNKNOWN`, and `required-on-populated` answered
that instead of its own code. The test now lints every body through the kernel's `validate` against
the packs installed before it, and fails on `number`; with `decimal`, all eight `declare` fixtures
answer the same code at the same address through `planPack` and `installPack` on a real record too
(the two `_OUT_OF_RANGE` ones by requiring 2 against a build at 1).

**`DEPENDENCY_UNRESOLVED` at `requires` cannot be reached through a pack, measured.** On the pack path
`declare`'s plan answers first: a page requiring `register.clients` through `planPack` is
`REGISTER_UNRESOLVED` at `page.clients.requires`, and so is the same page after a version retires
`clients` and after the pack declaring `clients` is disabled; a page requiring the kernel's own
`register.session` installs clean. The kernel's arm is what a declaration set from the app meets,
because `setDeclaration` hands one body to `kernel.install` with no plan in front, and there the same
page answers `DEPENDENCY_UNRESOLVED` at `requires`. The test drives that one fixture through
`setDeclaration` and names it in `IN_APP` with the reason. Its other two arms (a block reading, or a
capture writing, a register the page does not require) need no record and would be `lint` fixtures.

**`create-foreign-register`'s `lint` body was missing a `once_per`, and the `lint` runner could not
see it.** Put through a real install, the body lent from `lint-inputs.json` answered
`REQUIRED_MISSING`: *"rule.spawn-invoices notifies, creates or suggests, and declares no once_per"*.
That check is in the kernel's install path and not in `validate`, so `lint` accepted a pack no record
would. With `once_per: ["entry"]` the fixture answers `CREATE_FOREIGN_REGISTER` at `register` against a
record holding the other pack, and on a fresh record the same pack is `REGISTER_UNKNOWN`, because
`invoices` does not exist.

**`seq-prefix-taken` takes the installed arm and says so in a comment.** `INV` is no kernel prefix;
the pack alone installs clean on a fresh record, and with `installed:` in place it answers *"seq_prefix
'INV' is taken by register.invoices"*. The kernel arm (`D`, `SG`, `S`) needs no record and would be a
`lint` fixture.

**`GROUP_BY_CARDINALITY` is driven on its ref arm**, a `ref` to a list holding 51 rows, because that is
the arm that needs a record. The enum arm (51 declared values) is refused by the kernel's install as
well but needs no rows. `facts.distinct`, which `40 §6` lists, is carried by no fixture: the one code
about values is driven where the values are rows.

**Proved red** by cutting `field-type-changed.yaml`'s `at` one segment short, to
`register.obligations.fields.amount`: the run read `pass 13, fail 1, skipped 3`, the failure
*"claims `at: register.obligations.fields.amount`"* against `register.obligations.fields.amount.type`,
and restoring it read `pass 14, fail 0, skipped 3`.

## Adding the next driver

A driver is one async function, `(input, fixture) => Envelope`, where `Envelope` is
`{ kind, code?, at?, fix?, extra? }` and `kind` is `refusal`, `conflict` or `accepted`. Nothing else in
`run-via.mjs` knows what a pack or a predicate is. Register it in `DRIVERS` under its `via`, add a
reader for its input keys to `READERS`, and the comparison, the reporting and the exit codes are
already there.

**The second driver cost two edits to the shared half, and both are worth knowing before the third.**
`inputFor` held `lint`'s three input keys inline, which was right while there was one driver and became
two families' input formats in one `if` chain with nothing saying which line belonged to which; it is
now `READERS`, keyed by `via`. And `compare` gained `extra`, because `compile` answers with a list and
`lint`'s surfaces answer with one refusal, so the shared comparison had nowhere to put "this was
refused twice". Both are the kind of edit `40 §6` means by *"a day's work each rather than a
rewrite"*: nothing about the `lint` driver moved, and nothing about the reporting or the exit codes
did.

`DRIVERS` holds a sentence instead of a function for the seven `via`s this file does not drive, and
the sentences are not interchangeable: `write`, `render` and, since 22 September 2026, `install` are
driven elsewhere, and the other four are not driven at all. `import` is the cheapest of the four genuinely unbuilt: `tamper:` is one word per code
and `record:` is a seed name, so its seven fixtures need two scalar lines each rather than a
hand-written body, though the harness behind them is an export, a tamper and an import against a real
record, which is more than `where` needed. `rpc` is the largest and the most expensive. `install` needs
everything `lint` needs plus what is already on the record, which is why the two families are split at
all: five of its thirteen driven fixtures open a real one, and the other eight read an `Installed`
built to stand in for one.

## What the runner asserts

- The surface refused. An accepted input is a failure, because a fixture is a refusal.
- `code` is exactly the fixture's `code`.
- `at` is exactly the fixture's `at`, and a fixture with no `at` claims the refusal has none. `40 §6`
  made the key optional on 20 September 2026 after a required one bought nine invented addresses, so
  silence is a claim.
- `fix` is a sentence: not empty, ending in terminal punctuation.
- The refusal list is one long, where the surface answers with a list at all. `40 §6`'s rule two and
  its `record/test` row both say so, and a driver reports the rest as `extra`.

The `fix` is not compared against the fixture's own `fix:`, and that is deliberate. A fixture's `fix`
is the reader's summary of the repair; the surface's quotes the caller's own values back, so the two
are different strings on purpose. `30 §6`'s whole requirement of a `fix` is that it is a sentence.
`refusals-write.test.ts` made this call first and this runner keeps it.
