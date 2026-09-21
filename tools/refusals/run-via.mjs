/**
 * `40 §6`'s `via` runners, behind one command: take a `via`, drive that surface with every fixture
 * behind it, and compare the real refusal envelope to what the fixture claims.
 *
 * TWO OF THE NINE RUNNERS WERE ALREADY BUILT WHEN THIS ARRIVED, and finding that out is the reason
 * this file is a dispatcher rather than a third runner. `e74a563b` (September 20th 2026) added
 * `packages/kernel/test/refusals-write.test.ts` for `via: write` and
 * `apps/web/test/refusals-render.test.ts` for `via: render`, and both drive their surface for real.
 * `loop/STATUS.md` §5 and `docs/40-SPEC-FIXTURES.md` §6 still say none of the eight exists; both are
 * one day stale. So the gap is not "no runner drives a fixture", it is "seven of nine vias have no
 * driver and there is no one place that says which".
 *
 * WHAT A DRIVER IS. One async function per `via`, `(input, fixture) => Envelope`, where `Envelope`
 * is `{ kind, code?, at?, fix? }` and `kind` is `refusal`, `conflict` or `accepted`. Nothing else in
 * this file knows what a pack or a predicate is. Adding `install`, `where`, `rpc`, `import`, `pull`
 * or `ask` is writing one such function and one line in `DRIVERS`, which is what `40 §6` means by
 * "the other seven are a day's work each rather than a rewrite".
 *
 * WHY `lint` IS THE ONE DRIVER HERE. It has the most fixtures of any via with no runner (27 of 119,
 * against `rpc`'s 30 which are already claimed by nothing and need a seeded record and a principal),
 * and its harness is the cheapest measurable: `validate()` in `packages/kernel/src/declare.ts` is a
 * synchronous pure function over one declaration, and `normalise()` in
 * `packages/declare/src/index.ts` is one `await` over one document. No SQLite, no record, no HTTP,
 * no clock. Measured: the whole 27-fixture run below takes about 250 ms end to end, against the
 * write runner's SQLite record per fixture.
 *
 * IT DRIVES THE TWO FILES THE FIXTURES NAME IN `raises:`, and that is a deliberate choice the write
 * runner made first. 22 of the 27 name `packages/kernel/src/declare.ts`, 4 name
 * `packages/declare/src/index.ts` and 1 names `packages/declare/src/shared.ts`. A runner one layer
 * above the raiser goes green the day the layer between them starts answering for itself, so a pack
 * is linted here exactly as `lintBatch` lints one: `normalise` first, then `validate` per
 * declaration with `known` and `owners` overlaid from the batch, which is what `knownTo` and
 * `ownersTo` do for a batch with no record behind it.
 *
 * THE INPUTS ARE NOT IN THE FIXTURES YET, AND THE RUNNER SAYS SO ON EVERY LINE IT BORROWS ONE.
 * `40 §6` gives the `lint` family one input key, `pack:`, and counted on September 21st 2026 not one
 * of the 27 carries it: 17 of 119 fixtures carry a body and all 17 are `write` or `render`. So the
 * bodies live in `tools/refusals/lint-inputs.json` for now, keyed by fixture file name, and this
 * runner prefers a fixture's own `pack:` and falls back to that file. Every borrowed line is marked
 * `(borrowed)` in the output, because a fixture that passes on somebody else's input is still a
 * fixture with no input. `tools/refusals/README.md` says what to fold where.
 *
 * Usage:
 *   node --experimental-strip-types tools/refusals/run-via.mjs lint
 *   node --experimental-strip-types tools/refusals/run-via.mjs lint --json
 *   node --experimental-strip-types tools/refusals/run-via.mjs rpc        # says what is missing
 *
 * Exit codes: 0 every fixture agreed with its surface; 1 at least one did not; 2 this `via` has no
 * driver, or nothing could be driven at all. 2 rather than 0 because a runner that ran nothing and
 * said nothing is the state this file exists to end.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { family } from '../../fixtures/corpus.ts';

/* RELATIVE PATHS AND NOT `@braindog/declare`. This file is under `tools/`, which is not a workspace
   package and has no dependency on one; a bare specifier here resolves against the root
   `node_modules` and finds nothing. Node's own type stripping reads the `.ts` files directly, and
   the bare specifiers INSIDE them resolve against their own package, which is why the import chain
   works from here at all. */
import { normalise } from '../../packages/declare/src/index.ts';
import { readShared } from '../../packages/declare/src/shared.ts';
import { validate } from '../../packages/kernel/src/declare.ts';
import { compile, parseWhere, INBOX_RAW } from '../../packages/where/src/index.ts';

/**
 * IT SITS BESIDE THE RUNNER AND NOT BESIDE THE CORPUS, AND THAT IS MEASURED RATHER THAN PREFERRED.
 * `tools/gates/refusal-fixtures.mjs:304` walks `fixtures/refusals/` and pushes a finding for every
 * entry whose extension is not `.yaml`, and a finding there sets `process.exitCode = 1`. So a
 * `lint-inputs.json` next to the fixtures turns the enumeration gate red, and so would a
 * `README.md`. The bodies live here until they are folded into the fixtures themselves.
 */
const INPUTS = fileURLToPath(new URL('./lint-inputs.json', import.meta.url));

/* ── the envelope every driver answers with ─────────────────────────────────────────────────── */

const refusal = (r) => ({ kind: 'refusal', code: r.code, at: r.at, fix: r.fix });
const accepted = () => ({ kind: 'accepted' });

/**
 * A `Result` from `@braindog/ports`, read without importing it.
 *
 * `refused()` AND `conflicted()` ARE NOT REACHED FOR, because this file already crosses two packages
 * by relative path and a third import buys one predicate. What a driver needs is the shape: `ok`
 * false with a `refusal`, `ok` false with a `conflict`, or `ok` true. The write runner needs
 * `codeOf` because a conflict carries no code; no `lint` fixture is derived from an envelope, so
 * nothing here does.
 */
function envelopeOf(result) {
  if (result === null) return accepted();
  if (result?.ok === true) return accepted();
  if (result?.refusal) return refusal(result.refusal);
  if (result?.conflict) return { kind: 'conflict', ...result.conflict };
  /* A BARE `Refusal`, which is what `validate` answers with: it is not a `Result` at all. */
  if (typeof result?.code === 'string') return refusal(result);
  throw new Error(`a driver answered with ${JSON.stringify(result)}, which is no envelope this reader knows`);
}

/* ── the `lint` driver ──────────────────────────────────────────────────────────────────────── */

/**
 * A pack, linted alone and offline, exactly as `lintBatch` lints a batch with no record behind it.
 *
 * THE ORDER IS THE PRODUCTION ORDER AND IT MATTERS. `normalise` reads the document and refuses the
 * pack-level faults (`PACK_MALFORMED`, `SECRET_IN_PACK`, `COLOUR_OUTSIDE_THEME`,
 * `PROVIDES_MISMATCH`) before any declaration body is deep-checked, because `normalise` is what
 * turns a stranger's document into declarations at all. Measured while building the inputs: a pack
 * carrying both a stray `colour:` and a bad field type answers `COLOUR_OUTSIDE_THEME`, so a fixture
 * whose input trips an earlier check never reaches its own code, and the runner says which code it
 * got instead rather than passing on a refusal that happened to be nearby.
 *
 * `known` AND `owners` COME FROM THE BATCH AND FROM NOWHERE ELSE, which is the whole difference
 * between `lint` and `install`. `knownTo` and `ownersTo` read the `declaration` table and then
 * overlay the batch; with no record there is only the overlay. That is enough for
 * `CREATE_OVER_BOUND`, whose axes are an enum's `values` in a register the same pack declares, and
 * it is NOT enough for `CREATE_FOREIGN_REGISTER`, which needs a register another pack already owns.
 * See `tools/refusals/README.md`.
 */
async function driveLint(input) {
  /* THREE INPUT SHAPES, AND `40 §6` NAMES ONE. Measured while building the inputs: two of the 27
     codes cannot be reached through a pack at all. `PACK_OVER_CAP` is raised only by `readShared` in
     `packages/declare/src/shared.ts`, which weighs a `.usecase.json` file and has nothing to do with
     a manifest, and `normalise` holds no size cap at all. `KIND_UNKNOWN` is raised by `validate` for
     a kind outside the eight, and `normalise` refuses such a declaration as `PACK_MALFORMED` at
     `declarations` before `validate` is ever called, so a pack is the one input that cannot carry it.
     Both are drivable, and both need an input key `40 §6`'s `lint` row does not have. */
  if (input.usecase !== undefined) return envelopeOf(await readShared(input.usecase));
  if (input.decl !== undefined) return envelopeOf(validate(input.decl));

  const pack = await normalise(input.pack);
  if (!pack.ok) return envelopeOf(pack);

  const batch = pack.value.declarations.map((d) => ({ id: d.id, kind: d.kind, body: d.body, pack: pack.value.manifest.pack }));
  const known = new Map(batch.map((d) => [d.id, d.body]));
  const owners = new Map(batch.map((d) => [d.id, d.pack ?? null]));
  for (const decl of batch) {
    const fault = validate(decl, known, owners);
    if (fault) return refusal(fault);
  }
  return accepted();
}

/* ── the `where` driver ─────────────────────────────────────────────────────────────────────── */

/**
 * A FIXED INSTANT, because a sentence carries relative words and a runner that read the wall clock
 * would be a runner whose answer changes at midnight. `resolveDay` in
 * `packages/where/src/sentence.ts` turns `today` and `+30d` into a day against this number, so a
 * `where` fixture naming one is a fixture about a fixed day. The write runner fixed its clock at
 * 2026-09-05 for the same reason; this is the day the `where` family was folded.
 */
const WHERE_NOW_MS = Date.UTC(2026, 8, 21, 12);

/**
 * A register declaration read as the `Schema` the compiler takes.
 *
 * IT IS `schemaOf`'S MAPPING AND NOT A CONVENIENT SUBSET OF IT. `packages/kernel/src/index.ts:1094`
 * is the production translation from an installed register to a schema, and every key it carries is
 * there because leaving it out broke something the file records: `state` because one shipped
 * register mirrors a field called `lane` and going by the name read a column that is NULL on every
 * row; `series` because `02 §5`'s rule against text over a series was kept by nothing until the flag
 * travelled; `of` because a `has` over a `list<ref>` without it searches a column of row ids for a
 * title and matches nothing for ever. A runner that dropped any of them would answer a different
 * question from the record and call the difference a fixture's fault.
 *
 * IT IS COPIED RATHER THAN CALLED, and that is forced rather than chosen: `schemaOf` is a closure
 * inside `makeKernel`, reachable only through `openRecord`, which is a SQLite record and a migration
 * run. The whole reason `where` is the cheapest family left is that its surface needs neither. The
 * kernel keeps a second copy of this same mapping itself, at `unreadable`'s `shape()`
 * (`index.ts:1256`), for a register arriving in a batch with no record behind it, which is exactly
 * this situation; that copy omits `state`, so this one follows `schemaOf` and not it.
 */
const schemaOfRegister = (decl) => ({
  register: decl.id,
  ...(decl.state === undefined ? {} : { state: decl.state }),
  ...(decl.series === true ? { series: true } : {}),
  fields: Object.fromEntries(
    (decl.fields ?? [])
      .filter((f) => !f.retired)
      .map((f) => [
        f.id,
        {
          type: f.type,
          ...(f.of ? { of: f.of } : {}),
          ...(f.values ? { values: f.values } : {}),
          ...(f.to ? { to: f.to } : {}),
          ...(f.label ? { label: f.label } : {}),
          ...(f.labels ? { labels: f.labels } : {}),
        },
      ]),
  ),
});

/**
 * One predicate, compiled against one register, with nothing behind either.
 *
 * `compile` ANSWERS WITH A LIST AND NOT A `Result`, which is the one thing a `where` driver has to
 * know that no other via's does. `Compiled` is `{ sql, params, bad }`: a refused predicate still
 * comes back with a SQL string, and `bad` non-empty is the caller's instruction to run nothing. So
 * the envelope is `bad[0]`, and an empty `bad` is the surface accepting the predicate.
 *
 * AND THE LIST IS ASSERTED TO BE ONE LONG, which is `40 §6`'s own rule two and its `record/test` row
 * (*"refusals.length === 1"*). A predicate that trips two checks is a fixture that is not about one
 * code, and the runner names the others rather than quietly reporting the first.
 *
 * THE SENTENCE FORM AND THE TREE FORM ARE ONE KEY, because `40 §6` gives this family one
 * `predicate:` and the record itself takes both through one function: `predicateOf`
 * (`packages/kernel/src/metrics.ts:394`) parses a string and resolves a tree, and `unreadWhere`
 * compiles whatever comes out. A flow collection is the tree and a plain scalar is the sentence,
 * which is the same distinction `fixtures/corpus.ts` already draws when it reads the file.
 *
 * `unreadWhere`'S `REF_UNKNOWN` EXEMPTION IS DELIBERATELY NOT COPIED. That line skips a
 * `REF_UNKNOWN` because `owner is Kiln` may name a row somebody writes tomorrow and a rule is being
 * INSTALLED; it is a fact about install, not about the compiler. Copying it here would make
 * `ref-unknown.yaml` the one `where` fixture whose code the runner is built to discard.
 *
 * `refByTitle` ANSWERS `null` AND IS NOT LEFT OUT. Omitting it reaches the same refusal by a
 * different road — `packages/where/src/sentence.ts:599` gives up when the callback is absent — and
 * the two roads are not the same claim. A `where` fixture has no record behind it, so a lookup that
 * runs and finds nothing is what the family means, and saying so is what makes the fixture about the
 * name and not about the runner's wiring.
 */
async function driveWhere(input) {
  /* `INBOX_RAW` IS THE SCHEMA AND NOT A REGISTER READ AS ONE. `34 §1.9` gives an arrival exactly
     seven addressable names and `specOf` withholds the record's five kernel columns there, which is
     why `packages/where/src/index.ts:295` publishes the shape as a constant rather than deriving it.
     No fixture in the corpus carries `subject: inbox_raw` today; the branch is here because `40 §6`
     names the key, and a runner that ignored a documented key would report the first fixture to use
     it as a disagreement about its own code. */
  const schema = input.subject === 'inbox_raw' ? INBOX_RAW : schemaOfRegister(input.register);

  const bad = [];
  let predicate = input.predicate;
  if (typeof predicate === 'string') {
    const said = parseWhere(predicate, schema, { nowMs: WHERE_NOW_MS, refByTitle: () => null });
    bad.push(...said.bad);
    predicate = said.predicate;
  }
  /* AND THEN COMPILED, WHICH IS `unreadWhere`'S OWN ORDER AND ITS OWN PARAGRAPH: the sentence form
     was refused and the tree form installed for the same mistake, because parsing resolves dates and
     compiling is what "can be read" means. A sentence the parser refused has no predicate to compile,
     so the second step only runs when the first produced one. */
  if (bad.length === 0) bad.push(...compile(predicate, schema).bad);

  if (bad.length === 0) return accepted();
  return { ...refusal(bad[0]), ...(bad.length > 1 ? { extra: bad.slice(1).map((b) => b.code) } : {}) };
}

/**
 * Every `via` and what drives it. A `string` in place of a function is the reason there is none, and
 * it is printed rather than treated as an absence.
 *
 * THE SEVEN REASONS ARE NOT THE SAME REASON, which is why they are written out. `write` and `render`
 * are not missing a driver, they have one somewhere else and a second copy here would be two answers
 * about one corpus. The rest are missing a driver AND the input it would read.
 */
const DRIVERS = {
  lint: driveLint,
  where: driveWhere,
  write: 'driven by `packages/kernel/test/refusals-write.test.ts` since e74a563b. Run: node --test --experimental-strip-types "packages/kernel/test/refusals-write.test.ts"',
  render: 'driven by `apps/web/test/refusals-render.test.ts` since e74a563b. Run: node --test --experimental-strip-types "apps/web/test/refusals-render.test.ts"',
  install: 'no driver. Needs `pack:` plus `installed:` and `facts:`, and a materialised record, because every one of its 20 codes cites rows, an installed pack or the record\'s versions.',
  rpc: 'no driver. Needs `record:`, `call:` or `calls:`, and `principal:`, and a seeded record with a principal behind it. 30 fixtures, the largest family, and the most expensive harness.',
  import: 'no driver. Needs `record:` and `tamper:`, and an export-tamper-import round trip. Cheapest of the six left: `tamper:` is one word per code and `record:` is a seed name.',
  pull: 'no driver. Needs `declare:`, `grant:` and `answers:`, and the scheduled connector run driven the way the Worker\'s alarm drives it.',
  ask: 'no driver. Needs `record:`, `ask:`, `replies:` and `settings:`, and `packages/spark/test/double.ts` standing in for the model.',
};

/* ── comparing a claim to an answer ─────────────────────────────────────────────────────────── */

/**
 * What the fixture claims, against what the surface said.
 *
 * THE SENTENCE IS CHECKED AS A SENTENCE AND NOT AGAINST THE FIXTURE'S OWN `fix:`, which is the call
 * the write runner made first and the right one: a fixture's `fix:` is the reader's summary of the
 * repair, and the surface's quotes the caller's own values back, so they are two different strings
 * on purpose. `30 §6`'s whole requirement of a `fix` is that it is a sentence, and that is what is
 * asserted: not empty, and ending in terminal punctuation.
 *
 * AN ABSENT `at` IS A CLAIM TOO. `40 §6` made `at` optional on September 20th 2026 after a required
 * key bought nine invented addresses, so a fixture with no `at` is claiming the refusal has none,
 * and a surface that answers with one has broken that claim as surely as one that answers a
 * different path.
 */
function compare(fixture, answer) {
  const claims = fixture.keys;
  const faults = [];
  if (answer.kind === 'accepted') return ['the surface ACCEPTED the input, and a fixture is a refusal'];
  if (answer.kind === 'conflict' && !claims.has('derived'))
    faults.push('the surface answered with a conflict envelope and the fixture is not marked `derived:`');
  if (answer.code !== claims.get('code')) faults.push(`claims code ${claims.get('code')} and the surface said ${answer.code}`);

  /* ONE REFUSAL AND NOT THE FIRST OF SEVERAL, which is `40 §6`'s rule two and its `record/test` row
     in as many words: *"refusals.length === 1"*. A surface that answers with a list — `compile` is
     the one here, and every install plan is another — lets a fixture agree on `bad[0]` while a second
     check it never meant to trip sits behind it, and the day the first check moves the fixture starts
     testing the second silently. Any driver may set `extra`; only one has a list to set it from. */
  if (Array.isArray(answer.extra) && answer.extra.length > 0)
    faults.push(`was refused ${answer.extra.length + 1} times over and 40 §6 asks for one: also ${answer.extra.join(', ')}`);

  const at = claims.get('at');
  if (at === undefined && answer.at !== undefined) faults.push(`claims no address and the surface answered at ${answer.at}`);
  else if (at !== undefined && answer.at !== at) faults.push(`claims at ${at} and the surface answered ${answer.at === undefined ? 'no address' : `at ${answer.at}`}`);

  const fix = typeof answer.fix === 'string' ? answer.fix.trim() : '';
  if (fix === '') faults.push('was refused with an empty fix');
  else if (!/[.?!]$/.test(fix)) faults.push(`was refused with "${fix}", which is not a sentence`);
  return faults;
}

/* ── the command ────────────────────────────────────────────────────────────────────────────── */

function borrowed(via) {
  if (via !== 'lint') return new Map();
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(INPUTS, 'utf8'))));
  } catch (e) {
    if (e?.code === 'ENOENT') return new Map();
    throw new Error(`tools/refusals/lint-inputs.json is not JSON this reader can hand to JSON.parse: ${String(e)}`);
  }
}

/**
 * A fixture's own input, or the borrowed one, or nothing.
 *
 * THE FIXTURE WINS WHEN IT HAS ONE, so folding a body into a fixture takes the borrowing away by
 * itself and the day the last one is folded `lint-inputs.json` is dead rather than merely unread.
 * The whole `where` family was folded this way and borrows nothing, which is what a folded family
 * looks like: `borrowed(via)` answers an empty map for every via but `lint` and there is no second
 * lending file to write.
 *
 * WHICH KEYS A FIXTURE CARRIES IS THE VIA'S BUSINESS AND NOT THIS FUNCTION'S. It was `lint`'s three
 * `if`s inline until a second via arrived, and a second via's keys read here would have been two
 * families' input formats in one chain with nothing saying which line belonged to which. See
 * `READERS`.
 */
function inputFor(via, fixture, lent) {
  const own = READERS[via]?.(fixture.keys);
  if (own !== null && own !== undefined) return { source: 'fixture', input: own };
  const lending = lent.get(fixture.name);
  if (lending !== undefined) return { source: 'borrowed', input: lending };
  return { source: 'none', input: null };
}

/**
 * Each via's input keys, read off the fixture. `null` means this fixture carries none.
 *
 * THE KEYS ARE `40 §6`'S OWN AND THE GATE HOLDS THEM TO IT, which is why a reader may not invent a
 * convenience key. `tools/gates/refusal-fixtures.mjs:347` builds the allowed set from that table's
 * Input-keys column, per `via`, and pushes a finding for any other key a fixture carries: a `where`
 * fixture holding a `series:` or a `sentence:` goes red in the gate however well it ran here. So the
 * `where` family's three keys are all three it has, which is why `series: true` arrives inside
 * `register:` and a sentence arrives as `predicate:`.
 *
 * A FLOW COLLECTION IS JSON AND A PLAIN SCALAR IS NOT, which is the one rule both readers turn on.
 * `lint`'s `usecase:` is a document and `where`'s `predicate:` may be a sentence, so neither is
 * parsed; everything else here is a mapping written the way `fixtures/corpus.ts` reads one.
 */
const READERS = {
  /* THREE ALTERNATIVE SHAPES AND NOT THREE PARTS OF ONE, which is what makes this an `if` chain and
     the `where` reader an object. Two of the 27 `lint` codes cannot be reached through a pack at
     all, so each fixture names the single surface it drives. See `driveLint`. */
  lint: (keys) => {
    if (keys.has('pack')) return { pack: JSON.parse(keys.get('pack')) };
    if (keys.has('decl')) return { decl: JSON.parse(keys.get('decl')) };
    if (keys.has('usecase')) return { usecase: keys.get('usecase') };
    return null;
  },
  /* AND HERE THE KEYS ARE PARTS OF ONE INPUT: a predicate means nothing without the register it is
     read against. `predicate:` is the one that decides whether there is an input at all, because
     `subject:` defaults to `entry` (`Schema.subject`, *"absent means entry, which is every
     register"*) and a fixture whose subject is `inbox_raw` needs no register of its own. */
  where: (keys) => {
    const said = keys.get('predicate');
    if (said === undefined) return null;
    return {
      predicate: said.startsWith('{') || said.startsWith('[') ? JSON.parse(said) : said,
      ...(keys.has('register') ? { register: JSON.parse(keys.get('register')) } : {}),
      ...(keys.has('subject') ? { subject: keys.get('subject') } : {}),
    };
  },
};

async function main(argv) {
  const via = argv.find((a) => !a.startsWith('-'));
  const asJson = argv.includes('--json');
  if (via === undefined) {
    process.stdout.write(`Usage: node --experimental-strip-types tools/refusals/run-via.mjs <via> [--json]\n  ${Object.keys(DRIVERS).join(' ')}\n`);
    return 2;
  }

  const driver = DRIVERS[via];
  if (driver === undefined) {
    process.stdout.write(`${via} is not one of 40 §6's nine: ${Object.keys(DRIVERS).join(' ')}\n`);
    return 2;
  }

  const fixtures = family(via);
  if (typeof driver === 'string') {
    process.stdout.write(`${via}: ${fixtures.length} fixtures, and this runner drove none of them.\n  ${driver}\n`);
    return 2;
  }

  const lent = borrowed(via);
  const rows = [];
  for (const fixture of fixtures) {
    /* READING THE INPUT IS INSIDE THE REPORT AND NOT BESIDE IT, because it throws and the reader has
       to be told which fixture threw. Measured with a twenty-eighth fixture carrying
       `pack: {pack: freelancer-uk, version: 1.0.0}`, which is a legal YAML flow collection and not
       JSON: `JSON.parse` in `inputFor` took the whole run down with a bare stack, and the 26 fixtures
       that had already agreed were nowhere in the output. That is the exact shape the fold described
       in `README.md` invites, one fixture at a time, and a runner that loses 26 answers to the 27th
       is worse than one that names the 27th. */
    let source;
    let input;
    try {
      ({ source, input } = inputFor(via, fixture, lent));
    } catch (e) {
      rows.push({
        fixture: fixture.name,
        code: fixture.keys.get('code'),
        source: 'fixture',
        verdict: 'threw',
        faults: [`its own input is unreadable: ${String(e?.message ?? e)}`],
      });
      continue;
    }
    if (input === null) {
      rows.push({ fixture: fixture.name, code: fixture.keys.get('code'), source, verdict: 'undriven', faults: ['carries no input, so nothing drives it'] });
      continue;
    }
    let answer;
    try {
      answer = await driver(input, fixture);
    } catch (e) {
      rows.push({ fixture: fixture.name, code: fixture.keys.get('code'), source, verdict: 'threw', faults: [String(e?.message ?? e)] });
      continue;
    }
    const faults = compare(fixture, answer);
    rows.push({
      fixture: fixture.name,
      code: fixture.keys.get('code'),
      source,
      verdict: faults.length === 0 ? 'agreed' : 'disagreed',
      answered: answer.kind === 'accepted' ? 'accepted' : `${answer.code} at ${answer.at ?? '(none)'}`,
      faults,
    });
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ via, fixtures: fixtures.length, rows }, null, 2)}\n`);
  } else {
    process.stdout.write(`${via}: ${fixtures.length} fixtures\n`);
    for (const row of rows) {
      const mark = row.verdict === 'agreed' ? 'ok  ' : 'FAIL';
      process.stdout.write(`  ${mark} ${row.fixture}${row.source === 'borrowed' ? ' (borrowed)' : ''}\n`);
      for (const fault of row.faults) process.stdout.write(`       ${fault}\n`);
    }
    const agreed = rows.filter((r) => r.verdict === 'agreed').length;
    const lending = rows.filter((r) => r.source === 'borrowed').length;
    process.stdout.write(`${agreed}/${rows.length} agreed with the surface; ${lending} ran on a borrowed input.\n`);
  }

  if (rows.length === 0) return 2;
  return rows.every((r) => r.verdict === 'agreed') ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
