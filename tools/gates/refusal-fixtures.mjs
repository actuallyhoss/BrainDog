/**
 * A refusal code with no fixture is an enumeration nobody exercises. `30 §6`; `52 §5.2`.
 *
 *   node tools/gates/refusal-fixtures.mjs
 *
 * `30 §6` closes its registry with the test that stops the enumeration rotting:
 *
 *     "And the test that stops the enumeration rotting: **every `code` has a fixture that produces
 *      it.** A code with no fixture fails CI; a refusal path with no code fails review; a code in
 *      this table that no fixture directory carries fails the same gate."
 *
 * and it fixes where the files live and what keys them:
 *
 *     "Every fixture lives at `fixtures/refusals/<name>.yaml`; the name is the code in kebab-case,
 *      and each fixture is keyed by the `via` that raises it — `install`, `lint`, `where`, `write`,
 *      `rpc` and the rest; the split per `via` is the fixtures spec's to count (40 §6)."
 *
 * THERE WAS NO `fixtures/` DIRECTORY, so that whole paragraph was a sentence about something nobody
 * had built, and `52 §3`'s gate table carried a `refusal-fixtures` row pointing at nothing. This is
 * the script half of it. `52 §5.2` splits the work in one line — *"the script owns the enumeration,
 * the tests own the behaviour"* — so what is here is: one fixture per code, one code per fixture,
 * kebab name = code, the header shape, and the live site each fixture claims. Whether driving that
 * site actually produces that code is the `via` runners' (`40 §6`), and they are not this file.
 *
 * ─── THE FORMAT, AND WHY IT IS NOT YAML-WITH-A-PARSER ────────────────────────────────────────────
 *
 *     # fixtures/refusals/row-locked.yaml
 *     code:   ROW_LOCKED                          # UPPER_SNAKE; kebab-case of it is the file name
 *     via:    write                               # one of 40 §6's seven — the surface a runner drives
 *     raises: packages/kernel/src/index.ts        # the file that CONSTRUCTS it, repo-relative
 *     at:     fields.lesson                       # the path the refusal carries — 30 §6's `at`
 *     found:  reverted                            # optional, and `wanted:` likewise
 *     fix:    Reopen the row before editing it.   # ONE sentence — 30 §6's shape for the fix
 *     declare:                                    # the via's input keys (40 §6), if the fixture
 *       register: learnings                       # carries them; this gate reads none of it
 *
 * The file is YAML and `40 §6` wrote it as YAML, but **nothing in this repository parses YAML**.
 * `42 §2` puts the one parser behind `@braindog/declare`'s `./yaml` subpath — *"the one module in
 * the repository that parses YAML"* — and that subpath does not exist: `packages/declare` exports
 * `.` alone, there is no `src/yaml.ts`, and `yaml` 2.9.0 is in no `package.json` and no
 * `node_modules`. Even once it does exist a gate may not reach for it: every script in this
 * directory imports node builtins, `./lib.mjs` and `@playwright/test`, and a gate that needed a
 * workspace package would need that package to build before the gates could run.
 *
 * SO THE HEADER IS A SUBSET A FORTY-LINE PARSER READS, AND THE BODY IS NOT READ AT ALL. Every key
 * this gate asserts on is a plain scalar at column 0. Anything indented belongs to a block and is
 * skipped whole, which is what lets a fixture carry `40 §6`'s nested `declare:`/`rows:`/`write:`
 * input for its runner without this file pretending to understand it. When `./yaml` lands, a real
 * parser reads these files unchanged — the subset is valid YAML, not a lookalike.
 *
 * ─── WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT ──────────────────────────────────────────────
 *
 * NOT `REFUSAL_CODES`. `52 §5.2` step 4 asks this gate to compare the table against the closed code
 * list a package exports, and `refusals.mjs` already does exactly that — both directions, family by
 * family, plus the counting sentence. Asserting it twice makes two files that can disagree about
 * one fact, and a reader hitting the disagreement has no way to tell which is the repair. The codes
 * here come from `30 §6`'s table because `30 §6` says *"this table stays the list's home"*, and
 * `refusals.mjs` is what holds the array to it.
 *
 * ─── THE SHORTFALL, AND WHY IT IS NOT A BUDGET ───────────────────────────────────────────────────
 *
 * `refusals.mjs` measures which codes the tree EMITS: 74 of the 112, with 38 emitted by nothing.
 * Writing 112 fixtures would mean inventing a path, an input and a `fix` sentence for 38 refusals no
 * line of code raises — fiction that passes for ever, and the exact silence the self-test exists to
 * break. So the corpus is the 74, and this gate's rule is about the tree rather than the registry:
 * **every code the source names has a fixture.** Today that shortfall is zero and it is red the
 * moment it is not.
 *
 * WHICH IS WHY THE 38 ARE NOT A BUDGET. `refusals.mjs` holds `BUDGET = 7` because it cannot tell its
 * three cases apart — a missing concept, a synonym, a placeholder — and a number is what you write
 * when the gate cannot make the judgement. Here it can: the codes without a fixture are exactly the
 * codes the source does not name, and both halves are computed on every run, so the number is
 * derived rather than stored. A stored 38 could go slack (nobody lowers it) or be widened by whoever
 * is in a hurry; a derived one cannot be either. It is printed, because it is the burn-down list
 * `30 §6` wants — but it is printed as arithmetic that already agrees, not as a promise.
 *
 * AND THE OTHER DIRECTION IS PER-FIXTURE, NOT COUNTED. Each fixture names the file that raises its
 * code and this checks that the file is there and still says it, so a refusal site that is renamed
 * or deleted takes its fixture red with it. That is the half `30 §6`'s "Raised where" column has
 * never had: it cites documents, and nothing in the tree connected a code to the line.
 *
 * A DIFFERENT PREDICATE FROM `refusals.mjs`, ON PURPOSE, AND THEY AGREE. That gate matches the shape
 * of a refusal CONSTRUCTOR — `no(` `bad(` `refuse(` `at(` and `code:` — because it is hunting for
 * codes outside the registry and has to see the call. This one asks the simpler question: is the
 * code written as a whole string literal anywhere in first-party source? Measured on 2026-09-09 the
 * two answers are the same code for code, 74 and 74. Simpler is right here because the failure this
 * gate guards against is a code somebody NAMED and did not fixture, and a test that asserts on a
 * code names it just as much as the line that throws it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const rel = (path) => path.slice(root.length + 1).split(String.fromCharCode(92)).join('/');

const findings = [];

/** `30 §6`: *"the name is the code in kebab-case"*, and nothing else in the repository spells it. */
const kebab = (code) => code.toLowerCase().replaceAll('_', '-');

/* ── 1 · the registry, and the fixture name each row claims ──────────────── */

const blueprint = read('docs', '30-BLUEPRINT.md');
const at6 = blueprint.indexOf('## 6 · The refusal model');
const section = blueprint.slice(at6, blueprint.indexOf('## 7 ', at6));
if (section.length < 500) findings.push('30 §6 is not where this gate looks for it');

/* THE FIXTURE COLUMN IS THE THIRD, AND IT IS READ RATHER THAN DERIVED. Every row of the nine tables
   carries the file name it expects, so the document can be wrong about its own rule — which is
   `52 §5.2` step 1, and the only check here that needs no fixture on disk at all. */
const rows = [...section.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| .* \| `([a-z0-9-]+)` \|$/gm)].map((m) => ({
  code: m[1],
  fixture: m[2],
}));
if (rows.length === 0) findings.push('30 §6 has no code table this gate can read');
for (const row of rows)
  if (row.fixture !== kebab(row.code))
    findings.push(`30 §6 files \`${row.code}\` as \`${row.fixture}\`, and kebab-case of it is \`${kebab(row.code)}\``);

const registry = new Map(rows.map((r) => [r.code, r]));

/* ── 2 · the seven `via`s, counted from the spec that owns them ──────────── */

/**
 * `30 §6` names five and says "and the rest", handing the closed list to `40 §6`. So it is read from
 * there — a count is read from the enumeration that owns it (`34 §6`), and a `via` list copied into
 * a gate is a list that stops agreeing with the runners the day somebody adds an eighth.
 *
 * THE INPUT KEYS COME OFF THE SAME ROW. `40 §6`'s table gives each `via` the keys its fixtures may
 * carry, backticked and colon-suffixed — `pack:`, `predicate:`, `tamper:` — beside the nested names
 * that carry no colon and are not top-level keys. Reading them makes that column load-bearing
 * instead of prose, and it is what lets a `write` fixture holding a `predicate:` go red.
 */
const fixtures40 = read('docs', '40-SPEC-FIXTURES.md');
const at40 = fixtures40.indexOf('## 6 · Refusals and errors');
const spec6 = fixtures40.slice(at40, fixtures40.indexOf('## 7 ', at40));
const VIAS = new Map(
  [...spec6.matchAll(/^\| `([a-z]+)` \| \d+ \| (.*?) \| .*? \| .*? \|$/gm)].map((m) => [
    m[1],
    new Set([...m[2].matchAll(/`([a-z_]+):`/g)].map((k) => k[1])),
  ]),
);
if (VIAS.size === 0) findings.push("40 §6's `via` table is not where this gate looks for it");

/** The keys this gate reads. `30 §6`'s Refusal shape, plus the two the fixture adds to it. */
const HEADER = { code: true, via: true, raises: true, at: true, fix: true, found: false, wanted: false };

/* ── 3 · the fixture directory, and the two places the corpus says it is ─── */

/**
 * TWO DOCUMENTS DISAGREE ABOUT WHERE THESE LIVE, so both are looked for and finding both is red.
 *
 * `30 §6` says `fixtures/refusals/<name>.yaml`. `40 §3`, `42 §3` and `52 §5.2` step 2 all say
 * `packages/fixtures/refusals/`, which is the same path read as relative to the package that carries
 * it. Neither existed when this gate was written, so guessing one and being silent about the other
 * would hard-code the guess. Both existing is the state worth refusing: half a move leaves two
 * corpora, and the one nobody edits is the one that stays green.
 */
const HOMES = ['fixtures/refusals', 'packages/fixtures/refusals'];
const homes = HOMES.filter((home) => {
  try {
    return statSync(join(root, ...home.split('/'))).isDirectory();
  } catch {
    return false;
  }
});
if (homes.length > 1) findings.push(`the fixtures are in two places at once: ${homes.join(' and ')}`);

/* ── 4 · every fixture, parsed ───────────────────────────────────────────── */

/**
 * The forty lines. Column 0 is the header; everything indented is the runner's.
 *
 * IT IS STRICT ABOUT WHAT IT DOES NOT UNDERSTAND. A line at column 0 that is not a comment, not
 * blank and not `key:` is a finding rather than a skip — the failure worth guarding against is a
 * fixture whose `code:` was typed as `code =` and silently read as absent, which would have taken
 * the file out of the corpus while leaving it on disk.
 */
function header(text, where) {
  const out = new Map();
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.startsWith('#') || /^\s/.test(line)) return;
    const m = /^([a-z_]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) {
      findings.push(`${where}:${i + 1} is not a key line, and this parser reads column 0 only`);
      return;
    }
    if (out.has(m[1])) findings.push(`${where}:${i + 1} says \`${m[1]}\` twice`);
    const value = (m[2] ?? '').trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    out.set(m[1], quoted ? quoted[2] : value);
  });
  return out;
}

/**
 * `30 §6`'s Refusal shape annotates its last field *"one sentence, imperative"*.
 *
 * ONE SENTENCE IS CHECKABLE AND IMPERATIVE IS NOT, and asserting only what can be measured is the
 * difference between a rule and a wish. A sentence break is terminal punctuation with anything after
 * it; the end is terminal punctuation with nothing after it. Neither is a number, so neither belongs
 * in `budgets.json` — `52 §4` is about numbers a design document owns, and a full stop is not one.
 */
const oneSentence = (fix) => /[.?!]$/.test(fix) && !/[.?!]\s/.test(fix) && /^[A-Z]/.test(fix);

const seen = new Map();
let fixtureCount = 0;

for (const home of homes) {
  const dir = join(root, ...home.split('/'));
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const where = `${home}/${entry.name}`;
    if (entry.isDirectory()) {
      findings.push(`${where} is a directory, and a fixture is one file`);
      continue;
    }
    if (extname(entry.name) !== '.yaml') {
      findings.push(`${where} is not a .yaml, and 30 §6 names the extension`);
      continue;
    }
    fixtureCount += 1;
    const name = entry.name.slice(0, -'.yaml'.length);
    const keys = header(readFileSync(join(dir, entry.name), 'utf8'), where);

    /* THE NAME IS THE CODE, AND THE CODE IS THE NAME. Two checks and not one: a file called
       `row-locked.yaml` holding `code: ROW_LOCKED` is the pair `30 §6` promises, and either half
       alone lets a rename land in one place. */
    const code = keys.get('code') ?? '';
    if (code === '') {
      findings.push(`${where} names no code`);
      continue;
    }
    if (kebab(code) !== name) findings.push(`${where} carries \`${code}\`, whose kebab-case is \`${kebab(code)}\``);
    if (!registry.has(code)) findings.push(`${where} carries \`${code}\`, which is not a code in 30 §6's table`);
    if (seen.has(code)) findings.push(`\`${code}\` has two fixtures: ${seen.get(code)} and ${where}`);
    seen.set(code, where);

    for (const [key, required] of Object.entries(HEADER))
      if (required && (keys.get(key) ?? '') === '') findings.push(`${where} has no \`${key}:\``);

    /* AND NO KEY BEYOND THE HEADER AND THIS `via`'S OWN INPUT. A closed list, for the reason
       `30 §6` gives about its own: a registry that grows whenever somebody needs a word is not one. */
    const via = keys.get('via') ?? '';
    if (via !== '' && !VIAS.has(via))
      findings.push(`${where} is via \`${via}\`, and 40 §6 names ${[...VIAS.keys()].join(' ')}`);
    const allowed = new Set([...Object.keys(HEADER), ...(VIAS.get(via) ?? [])]);
    for (const key of keys.keys())
      if (!allowed.has(key)) findings.push(`${where} carries \`${key}:\`, which is neither the header nor a ${via} input`);

    const fix = keys.get('fix') ?? '';
    if (fix !== '' && !oneSentence(fix)) findings.push(`${where}'s fix is not one capitalised sentence: "${fix}"`);

    /* THE SITE IT CLAIMS, READ. A fixture pointing at a file that does not name its code is a
       fixture about a refusal that has moved, and it is the only check here that opens the tree. */
    const raises = keys.get('raises') ?? '';
    if (raises !== '') {
      if (raises.includes('..') || raises.startsWith('/')) findings.push(`${where} raises \`${raises}\`, which leaves the tree`);
      else {
        let source = null;
        try {
          source = readFileSync(join(root, ...raises.split('/')), 'utf8');
        } catch {
          findings.push(`${where} raises \`${raises}\`, and there is no such file`);
        }
        if (source !== null && !new RegExp(`(['"])${code}\\1`).test(source))
          findings.push(`${where} raises \`${raises}\`, and nothing in it says \`${code}\``);
      }
    }
  }
}

/* ── 5 · every code the source names, and whether it has one ─────────────── */

/**
 * A code written as a whole string literal in first-party source.
 *
 * WHOLE, BECAUSE HALF OF ONE IS PROSE. `apps/web`'s job-view mock carries the string
 * "PROPOSAL_UNCITED — a proposal must attach the rows it read" as the text of a fake tool result,
 * and three source comments name a code in backticks to argue about it. A pattern that matched
 * inside a string or inside a comment reported four codes as raised that nothing raises, which is a
 * gate crying wolf about the one thing it exists to say.
 *
 * AND NOT THE REGISTRY ITSELF. `packages/ports/src/index.ts` is 112 quoted codes in nine arrays and
 * would answer yes to every one of them; the negative fixture trees under `tools/gates/negative/`
 * carry copies of it for the same reason, so the file is skipped by name wherever it sits. The
 * negatives are skipped whole besides: a seeded violation is an input to a gate, not source.
 */
const CODE_LITERAL = /(['"])([A-Z][A-Z0-9_]{2,})\1/g;
const named = new Map();
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDir(entry.name) && entry.name !== 'node_modules' && rel(path) !== 'tools/gates/negative') walk(path);
      continue;
    }
    if (!['.ts', '.svelte', '.mjs'].includes(extname(entry.name))) continue;
    const where = rel(path);
    if (where.endsWith('packages/ports/src/index.ts')) continue;
    scanned += 1;
    for (const m of readFileSync(path, 'utf8').matchAll(CODE_LITERAL))
      if (registry.has(m[2])) named.set(m[2], [...new Set([...(named.get(m[2]) ?? []), where])]);
  }
}
for (const dir of ['packages', 'apps', 'tools']) {
  const at = join(root, dir);
  try {
    if (statSync(at).isDirectory()) walk(at);
  } catch {
    /* a tree that is not here is not a finding */
  }
}

/* THE RULE, AND THE ONLY ONE HERE THAT IS ABOUT THE TREE RATHER THAN THE FILES. `30 §6`: a code
   with no fixture fails CI. Read against the tree it is: a code this build NAMES and no fixture
   covers is the enumeration rotting in the direction that costs something, because it is a refusal
   a caller can already be handed. */
const unfixtured = rows.filter((r) => !seen.has(r.code));
if (homes.length > 0)
  for (const code of [...named.keys()].sort())
    if (!seen.has(code))
      findings.push(`\`${code}\` is named by ${named.get(code).slice(0, 3).join(', ')} and has no fixture`);

/* ── 6 · the line ────────────────────────────────────────────────────────── */

if (findings.length > 0) {
  console.error(`\n  refusal-fixtures: ${findings.length} finding(s) — 30 §6\n`);
  for (const f of [...new Set(findings)].slice(0, 40)) console.error(`    ${f}`);
  console.error(
    '\n  30 §6: every code has a fixture that produces it, and a code with no fixture fails CI.\n' +
      '  The corpus is the codes this tree names; the rest are named in 30 §6 and raised by nothing,\n' +
      '  and a fixture for one of those would be an invented path and an invented sentence.\n',
  );
  process.exitCode = 1;
} else if (homes.length === 0) {
  /* EXIT 3 IS A SKIP, NOT A PASS. With no corpus on disk the checks above examined 30 §6 and
     nothing else, and printing green would say the fixtures are fine when there are none. */
  console.log(`  refusal-fixtures: ${rows.length} codes in 30 §6 and no fixtures — expected at ${HOMES[0]}/`);
  process.exit(3);
} else {
  console.log(
    `  refusal-fixtures: ${fixtureCount} fixtures for ${rows.length} codes in ${homes[0]}/, ` +
      `one per code and one code per fixture; ` +
      `${named.size} codes named across ${scanned} sources, all fixtured; ` +
      `${unfixtured.length} codes have none, and no source names any of them`,
  );
}
