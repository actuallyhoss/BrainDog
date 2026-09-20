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
 *      and each fixture is keyed by the `via` that raises it: `install`, `lint`, `where`, `write`,
 *      `rpc` and the rest; the split per `via` is the fixtures spec's to count (40 §6)."
 *
 * THERE WAS NO `fixtures/` DIRECTORY, so that whole paragraph was a sentence about something nobody
 * had built, and `52 §3`'s gate table carried a `refusal-fixtures` row pointing at nothing. This is
 * the script half of it. `52 §5.2` splits the work in one line: *"the script owns the enumeration,
 * the tests own the behaviour"*. So what is here is: one fixture per code, one code per fixture,
 * kebab name = code, the header shape, and the live site each fixture claims. Whether driving that
 * site actually produces that code is the `via` runners' (`40 §6`), and they are not this file.
 *
 * ─── THE FORMAT, AND WHY IT IS NOT YAML-WITH-A-PARSER ────────────────────────────────────────────
 *
 *     # fixtures/refusals/row-locked.yaml
 *     code:   ROW_LOCKED                          # UPPER_SNAKE; kebab-case of it is the file name
 *     via:    write                               # one of 40 §6's seven, the surface a runner drives
 *     raises: packages/kernel/src/index.ts        # the file that CONSTRUCTS it, repo-relative
 *     derived: clash                              # optional; the code is read off this envelope, §6
 *     at:     lesson                              # the path the refusal carries (30 §6's `at`)
 *     found:  reverted                            # optional, and `wanted:` likewise
 *     fix:    Reopen the row before editing it.   # ONE sentence, 30 §6's shape for the fix
 *     declare:                                    # the via's input keys (40 §6), if the fixture
 *       register: learnings                       # carries them; this gate reads none of it
 *
 * The file is YAML and `40 §6` wrote it as YAML, but **nothing in this repository parses YAML**.
 * `42 §2` puts the one parser behind `@braindog/declare`'s `./yaml` subpath, *"the one module in
 * the repository that parses YAML"*. That subpath does not exist: `packages/declare` exports
 * `.` alone, there is no `src/yaml.ts`, and `yaml` 2.9.0 is in no `package.json` and no
 * `node_modules`. Even once it does exist a gate may not reach for it: every script in this
 * directory imports node builtins, `./lib.mjs` and `@playwright/test`, and a gate that needed a
 * workspace package would need that package to build before the gates could run.
 *
 * SO THE HEADER IS A SUBSET A FORTY-LINE PARSER READS, AND THE BODY IS NOT READ AT ALL. Every key
 * this gate asserts on is a plain scalar at column 0. Anything indented belongs to a block and is
 * skipped whole, which is what lets a fixture carry `40 §6`'s nested `declare:`/`rows:`/`write:`
 * input for its runner without this file pretending to understand it. When `./yaml` lands, a real
 * parser reads these files unchanged. The subset is valid YAML, not a lookalike.
 *
 * ─── WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT ──────────────────────────────────────────────
 *
 * NOT `REFUSAL_CODES`. `52 §5.2` step 4 asks this gate to compare the table against the closed code
 * list a package exports, and `refusals.mjs` already does exactly that: both directions, family by
 * family, plus the counting sentence. Asserting it twice makes two files that can disagree about
 * one fact, and a reader hitting the disagreement has no way to tell which is the repair. The codes
 * here come from `30 §6`'s table because `30 §6` says *"this table stays the list's home"*, and
 * `refusals.mjs` is what holds the array to it.
 *
 * ─── THE SHORTFALL, AND WHY IT IS NOT A BUDGET ───────────────────────────────────────────────────
 *
 * `refusals.mjs` measures which codes the tree EMITS, and some of the registry is emitted by
 * nothing. Writing a fixture for every registry entry would mean inventing a path, an input and a
 * `fix` sentence for refusals no line of code raises. That is fiction that passes for ever, and the
 * exact silence the self-test exists to break. So the corpus is what the source names, and this
 * gate's rule is about the tree rather than the registry: **every code the source names has a
 * fixture.** Today that shortfall is zero and it is red the moment it is not.
 *
 * NO FIGURES IN THIS PARAGRAPH, AND THAT IS THE POINT. It used to read "74 of the 112, with 38
 * emitted by nothing", measured once and then left. The registry is 126 now, so every number in it
 * was wrong, and a reader checking this gate's reasoning was being handed arithmetic that had not
 * been true for months. The counts are printed on every run by the line at the bottom of this file,
 * which is the only place they cannot go stale.
 *
 * WHICH IS WHY THE SHORTFALL IS NOT A BUDGET. `refusals.mjs` holds a small `BUDGET` because it cannot
 * tell its three cases apart (a missing concept, a synonym, a placeholder), and a number is what you
 * write when the gate cannot make the judgement. Here it can: the codes without a fixture are the
 * codes the source does not name, and both halves are computed on every run, so the number is
 * derived rather than stored. A stored 38 could go slack (nobody lowers it) or be widened by whoever
 * is in a hurry; a derived one cannot be either. It is printed, because it is the burn-down list
 * `30 §6` wants. It is printed as arithmetic that already agrees, not as a promise.
 *
 * AND A STORED 38 IS EXACTLY WHAT WENT SLACK, in the paragraph above rather than in the code. The
 * argument for deriving the number was written, acted on for the gate, and then the same file
 * carried three hand-typed copies of the number it had just finished arguing should never be
 * hand-typed. The code was right and its own explanation was the thing that rotted.
 *
 * AND THE OTHER DIRECTION IS PER-FIXTURE, NOT COUNTED. Each fixture names the file that raises its
 * code and this checks that the file is there and still says it, so a refusal site that is renamed
 * or deleted takes its fixture red with it. That is the half `30 §6`'s "Raised where" column has
 * never had: it cites documents, and nothing in the tree connected a code to the line.
 *
 * A DIFFERENT PREDICATE FROM `refusals.mjs`, ON PURPOSE, AND THEY AGREE. That gate matches the shape
 * of a refusal CONSTRUCTOR (`no(` `bad(` `refuse(` `at(`, `code:` and `new <Prefix>Error(`) because it
 * is hunting for codes outside the registry and has to see the call. This one asks the simpler
 * question: is the code written as a whole string literal anywhere in first-party source? Both are
 * at 115 on this tree, code for code, and the eleven with no fixture are exactly the eleven no line
 * constructs. Simpler is right here because the failure this gate guards against is a code somebody
 * NAMED and did not fixture, and a test that asserts on a code names it just as much as the line
 * that throws it.
 *
 * AND THE GAP BETWEEN THE TWO IS WHAT THE PAIR IS FOR. `refusals.mjs` printed 113 against this
 * gate's 115 until 2026-09-20, and the two it could not see were `PULL_SHAPE_MISMATCH` and
 * `PULL_EXPECT_FAILED`: `@braindog/connect` raises by constructing, `throw new PullError('CODE', …)`
 * at eight sites, and a predicate that knew four call verbs and no constructor walked past all
 * eight. The narrow predicate learned the constructor form and both now print 115. That is the
 * second time the disagreement has found a raising shape nobody had written down, which is the
 * argument for keeping both rather than for making one of them authoritative.
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
   carries the file name it expects, so the document can be wrong about its own rule. That is
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
 * there. A count is read from the enumeration that owns it (`34 §6`), and a `via` list copied into
 * a gate is a list that stops agreeing with the runners the day somebody adds an eighth.
 *
 * THE INPUT KEYS COME OFF THE SAME ROW. `40 §6`'s table gives each `via` the keys its fixtures may
 * carry, backticked and colon-suffixed (`pack:`, `predicate:`, `tamper:`), beside the nested names
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

/**
 * The keys this gate reads. `30 §6`'s Refusal shape, plus the two the fixture adds to it.
 *
 * `at` IS OPTIONAL, AND MAKING IT REQUIRED WAS COMPELLING A LIE. `41 §6` says in terms that `at` is
 * optional and that "a refusal with nothing to point at carries none, which is what the format
 * codes do today". This line said otherwise, so an author writing a fixture for a code whose
 * emitter carries no `at` had two moves: invent an address, or go red. Nine fixtures invented one.
 * Three of those nine are still here because the right value is nothing: `IMPORT_NOT_EMPTY` is
 * about several tables at once and says so in `fix`; `REGISTER_UNKNOWN` carries `allowed:` instead,
 * which is strictly more use than restating the code's own name; `VERSION_STALE` is derived from a
 * conflict envelope that has no slot for one.
 *
 * `derived` IS THE SAME ARGUMENT ONE FIELD ALONG, and it is an addition rather than a subtraction.
 * `at` was a required field with no honest answer, so the fix was to stop requiring it; `raises`
 * has an honest answer for every code and asks the wrong question of the handful that are read off
 * an envelope, so the fix is a way to say which question to ask. `§6` holds the whole of it.
 *
 * WHICH IS A SUBTRACTION AND NOT A CHECK, deliberately. Nothing here verifies that a fixture's `at`
 * matches what its emitter produces, and nothing cheap can: a code with six emitters has six legal
 * shapes, and each is a template literal over values only a running emitter has. That verification
 * is the `via` runners' (`40 §6`) and there is no honest proxy for it. What this line can do is
 * stop the format manufacturing claims nobody asked for, which is the cheaper half and is free.
 */
const HEADER = { code: true, via: true, raises: true, derived: false, at: false, fix: true, found: false, wanted: false };

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

/**
 * A CODE NAMED IN A COMMENT IS NOT AN EMITTER.
 *
 * `§5` scanned raw file text, and the paragraph there naming two codes as an example put both of
 * them into this gate's count by being written. A gate whose number moves when somebody EXPLAINS
 * it is a gate reading its own commentary, and it is the third time that shape has turned up in
 * this directory: dead-copy counted a copy key named in prose, flags counted a flag named in prose,
 * and both blank comments for exactly this reason.
 *
 * IT SITS HERE BECAUSE TWO SECTIONS READ THROUGH IT NOW. `§4`'s `raises:` check asks the same
 * question of one named file and asked it of raw text, so a file that argues about a code in a
 * comment counted as a file that raises it.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const readable = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

/**
 * THE TWO PLACES A CODE IS WRITTEN DOWN AND NOT RAISED, in one predicate both sections use.
 *
 * `packages/ports/src/index.ts` is the registry: 126 quoted codes in nine arrays, and it answers
 * yes to every code there is. The negative trees under `tools/gates/negative/` carry copies of it
 * and are a gate's input rather than its source. `§5` has skipped both since it was written and
 * `§4` did not, so a fixture could name the registry as the file that raises its code and go green
 * for the one thing the registry cannot fail to say.
 */
const registryFile = (path) => path.endsWith('packages/ports/src/index.ts');
const seeded = (path) => path === 'tools/gates/negative' || path.startsWith('tools/gates/negative/');

/* ── 4 · every fixture, parsed ───────────────────────────────────────────── */

/**
 * The forty lines. Column 0 is the header; everything indented is the runner's.
 *
 * IT IS STRICT ABOUT WHAT IT DOES NOT UNDERSTAND. A line at column 0 that is not a comment, not
 * blank and not `key:` is a finding rather than a skip. The failure worth guarding against is a
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
 * in `budgets.json`. `52 §4` is about numbers a design document owns, and a full stop is not one.
 */
const oneSentence = (fix) => /[.?!]$/.test(fix) && !/[.?!]\s/.test(fix) && /^[A-Z]/.test(fix);

const seen = new Map();
/** The `derived:` claims, resolved in `§6` once the tree has been walked for what exports what. */
const derivations = [];
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
    /* A CONSTRUCTOR IS A NAME. Anything else is not a claim this gate can resolve, so it is one
       finding and the fixture is read as any other from here: `§6` cannot chase an identifier that
       is not one, and three findings about one typo say no more than the first. */
    let derived = keys.get('derived') ?? '';
    if (derived !== '' && !/^[a-z][A-Za-z0-9_]*$/.test(derived)) {
      findings.push(`${where} is derived from \`${derived}\`, and a constructor is one identifier`);
      derived = '';
    }
    if (raises !== '') {
      if (raises.includes('..') || raises.startsWith('/')) findings.push(`${where} raises \`${raises}\`, which leaves the tree`);
      else if (registryFile(raises)) findings.push(`${where} raises \`${raises}\`, which is the registry and lists every code`);
      else if (seeded(raises)) findings.push(`${where} raises \`${raises}\`, which is a gate's seeded input and not source`);
      else {
        let source = null;
        try {
          source = readable(readFileSync(join(root, ...raises.split('/')), 'utf8'));
        } catch {
          findings.push(`${where} raises \`${raises}\`, and there is no such file`);
        }
        if (source !== null) {
          const says = new RegExp(`(['"])${code}\\1`).test(source);
          if (derived === '') {
            if (!says) findings.push(`${where} raises \`${raises}\`, and nothing in it says \`${code}\``);
          } else {
            /* THE CLAIM INVERTED. `derived:` says the raising file answers with an envelope and never
               names the code, so the file saying it is the fixture being wrong about itself. This is
               what stops the key becoming a way out: put it on an ordinary fixture and the ordinary
               fixture goes red, because its site does say its code. */
            if (says) findings.push(`${where} is derived from \`${derived}\`, and \`${raises}\` says \`${code}\` itself`);
            if (!new RegExp(`\\b${derived}\\s*[(<]`).test(source))
              findings.push(`${where} is derived from \`${derived}\`, and \`${raises}\` never calls it`);
            derivations.push({ where, code, derived });
          }
        }
      }
    }
  }
}

/* ── 5 · every code the source names, and whether it has one ─────────────── */

/**
 * A code written as a whole string literal in first-party source.
 *
 * WHOLE, BECAUSE HALF OF ONE IS PROSE. `apps/web`'s job-view mock carries the string
 * "PROPOSAL_UNCITED: a proposal must attach the rows it read" as the text of a fake tool result,
 * and three source comments name a code in backticks to argue about it. A pattern that matched
 * inside a string or inside a comment reported four codes as raised that nothing raises, which is a
 * gate crying wolf about the one thing it exists to say.
 *
 * AND NOT THE REGISTRY ITSELF. `packages/ports/src/index.ts` is 126 quoted codes in nine arrays and
 * would answer yes to every one of them; the negative fixture trees under `tools/gates/negative/`
 * carry copies of it for the same reason, so the file is skipped by name wherever it sits. The
 * negatives are skipped whole besides: a seeded violation is an input to a gate, not source.
 *
 * BOTH SKIPS ARE `§4`'S TOO NOW, and they were this section's alone for as long as the `raises:`
 * check existed. One fixture had found the gap: `version-stale.yaml` named the registry as the file
 * that raises `VERSION_STALE`, and the registry is the one file that cannot fail that question.
 */
const CODE_LITERAL = /(['"])([A-Z][A-Z0-9_]{2,})\1/g;
const named = new Map();
let scanned = 0;

/**
 * And what each source exports, which is the one thing `§6` needs and this walk is already open.
 *
 * COLLECTED FROM THE REGISTRY FILE TOO, unlike the codes. The registry is skipped for codes because
 * it names all of them; it is not skipped for exports, because `clash` is declared there and a
 * fixture naming a constructor has to be able to resolve one that lives beside the enumeration.
 */
const EXPORTED = /^export (?:const|function) ([A-Za-z_$][\w$]*)/gm;
const declares = new Map();

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDir(entry.name) && entry.name !== 'node_modules' && !seeded(rel(path))) walk(path);
      continue;
    }
    if (!['.ts', '.svelte', '.mjs'].includes(extname(entry.name))) continue;
    const where = rel(path);
    const text = readable(readFileSync(path, 'utf8'));
    for (const m of text.matchAll(EXPORTED)) declares.set(m[1], [...(declares.get(m[1]) ?? []), where]);
    if (registryFile(where)) continue;
    scanned += 1;
    for (const m of text.matchAll(CODE_LITERAL))
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

/* ── 6 · the derived codes, held to the constructor they name ───────────── */

/**
 * A CODE CAN BE RAISED WITHOUT BEING WRITTEN DOWN, and `§4` had no way to be told so.
 *
 * `30 §6` has three answers and not two: ok, a refusal, and a conflict. A refusal carries its own
 * `code`; a conflict carries a version, a row and an actor, and `ports`' `codeOf` is what reads it
 * as `VERSION_STALE`. So the file that RAISES the code never quotes it, and a fixture for one of
 * these had nowhere honest to point: for months `version-stale.yaml` pointed at the registry, which
 * lists all 126 and therefore cannot fail the question `§4` was asking.
 *
 * `derived:` IS NOT AN EXEMPTION, AND THE TEST IS THAT IT COSTS MORE THAN IT SAVES. A fixture
 * carrying it is checked three ways where a fixture without it is checked one:
 *
 *   1 · its site must NOT name the code (`§4`), which is the whole claim and the reason the key
 *       cannot be pasted onto an ordinary fixture to quieten it;
 *   2 · its site must CALL the constructor it names (`§4`), so `raises:` is still read against the
 *       tree and a site that stops answering with the envelope goes red;
 *   3 · the constructor must be exported by exactly one first-party source, and that source must
 *       name the code somewhere that is not a list of codes. Below.
 *
 * ONE SOURCE, BECAUSE TWO WOULD BE A GUESS. Resolving `clash` to a file is only honest while the
 * name is unambiguous across `packages`, `apps` and `tools`; the day a second package exports one
 * too, this says so rather than picking the first it walked into.
 *
 * AND A LINE THAT IS NOTHING BUT CODES IS A LIST. `packages/ports/src/index.ts` both declares the
 * envelope and holds the registry, so "does that file name the code" is a question it answers yes
 * to 126 times over, which is the same loophole one key along. A registry line is quoted codes, commas and
 * brackets and nothing else; strip those and what remains is empty. `codeOf`'s line does not go
 * empty, because it is an expression. That is the difference between listing a code and reading
 * one, measured rather than asserted.
 */
const listOfCodes = (line) => line.replace(/(['"])[A-Z][A-Z0-9_]{2,}\1/g, '').replace(/[\s,[\]]/g, '') === '';

for (const d of derivations) {
  const from = declares.get(d.derived) ?? [];
  if (from.length === 0) {
    findings.push(`${d.where} is derived from \`${d.derived}\`, which no first-party source exports`);
    continue;
  }
  if (from.length > 1) {
    const some = from.slice(0, 3).join(', ');
    findings.push(`${d.where} is derived from \`${d.derived}\`, and ${from.length} sources export it: ${some}`);
    continue;
  }
  const text = readable(readFileSync(join(root, ...from[0].split('/')), 'utf8'));
  const reads = text.split('\n').filter((l) => new RegExp(`(['"])${d.code}\\1`).test(l) && !listOfCodes(l));
  if (reads.length === 0)
    findings.push(`${d.where} is derived from \`${d.derived}\`, and ${from[0]} names \`${d.code}\` only in a list of codes`);
}

/* ── 7 · the line ────────────────────────────────────────────────────────── */

if (findings.length > 0) {
  console.error(`\n  refusal-fixtures: ${findings.length} finding(s) against 30 §6\n`);
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
  console.log(`  refusal-fixtures: ${rows.length} codes in 30 §6 and no fixtures. Expected at ${HOMES[0]}/`);
  process.exit(3);
} else {
  console.log(
    `  refusal-fixtures: ${fixtureCount} fixtures for ${rows.length} codes in ${homes[0]}/, ` +
      `one per code and one code per fixture; ` +
      `${named.size} codes named across ${scanned} sources, all fixtured; ` +
      `${unfixtured.length} codes have none, and no source names any of them; ` +
      `${derivations.length} read off an envelope rather than constructed, each resolved to the one source that exports it`,
  );
}
