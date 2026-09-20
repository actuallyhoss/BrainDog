/**
 * The refusal registry says the same thing in three places, and one of them is the code. `30 §6`.
 *
 *   node tools/gates/refusals.mjs
 *
 * `30 §6` opens with the reason there is a registry at all: *"Every document demands refusals that
 * name the field and what was expected. That only stays true if there is one shape."* And it names
 * where the list lives — *"the type `Refusal` (with `RefusalCode`) is a type-only export of
 * `@braindog/ports`, the lowest shared package, because `where` raises one and sits below the
 * kernel; **this table stays the list's home**, and every package imports the type."*
 *
 * `RefusalCode` DID NOT EXIST, and `code` was `string`. A code is the one part of a refusal a caller
 * can branch on: `10 §7` builds the agent contract on it — *"the refusal teaches"* — and an agent
 * teaches itself from a code that is stable across versions. With nothing closing the list, the first
 * audit counted **51 of the 99 emitted, 48 emitted by nothing, and 24 more outside the registry**.
 *
 * WHAT THIS GATE DOES, AND WHY IT IS A BUDGET RATHER THAN A RULE. Typing the field `RefusalCode`
 * against a tree carrying codes the registry has never heard of does not compile, and the twenty-four
 * were three different things wearing one number: concepts `30 §6` was missing and should gain by
 * amendment (`ROUTE_UNKNOWN`, `PAGE_UNKNOWN`); codes that already existed under another name
 * (`RECORD_NOT_EMPTY`, `WHERE_UNSUPPORTED`); and placeholders that should not exist at all
 * (`UNIMPLEMENTED`, `INTERNAL`, `SOMETHING_NOBODY_MAPPED`). Telling those apart is a judgement per
 * site, not a rename. A budget that may only go down measures the drift, makes the next invented
 * code red today, and lets the type narrow the day it reaches zero.
 *
 * The 2026-09-08 pass took it from twenty-four to seven, and the arithmetic is in the budget's own
 * comment below: eleven renames, thirteen amendments to `30 §6` — including a ninth family, `Host and
 * client`, for the boundary a request arrives through — and three placeholders given the refusal
 * they were standing in front of. Two of the seven that remain are test fixtures that SHOULD stay,
 * so the honest floor is above zero and the comment says which two and why.
 *
 * The three sources, and the same shape `event-kinds` uses for the one other list this large:
 *
 *   1 · `30 §6`'s table — the home, and what a person reads.
 *   2 · `30 §6`'s counting sentence — *"One hundred and fifteen, counted, in nine families"* plus
 *       nine sizes. A sentence that counts is a sentence that can be wrong, and a family can gain a
 *       code while the total stays right if another loses one.
 *   3 · `REFUSAL_CODES` in `@braindog/ports`, which is what code compares against.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const findings = [];

/* ── 1 · the table, by family ───────────────────────────────────────────── */

const blueprint = read('docs', '30-BLUEPRINT.md');
const section = blueprint.slice(blueprint.indexOf('## 6 · The refusal model'), blueprint.indexOf('## 7 ', blueprint.indexOf('## 6 · The refusal model')));
if (section.length < 500) findings.push('30 §6 is not where this gate looks for it');

/**
 * The families, in the order the counting sentence counts them.
 *
 * NINE SINCE 2026-09-08. `Host and client` is `30 §6`'s newest and the one it had never had: the
 * other eight are about the record's content and none of them is about the boundary a request
 * arrives through, so the two hosts and the client each minted their own word for a route that does
 * not exist. A family is appended rather than inserted so that the eight indices this file compares
 * positionally do not all shift for a change that adds nothing to any of them.
 */
const FAMILIES = [
  ['Pack and declaration', 'PACK'],
  ['Grammar', 'GRAMMAR'],
  ['Write path', 'WRITE'],
  ['Auth and vault', 'AUTH'],
  ['Format and lifecycle', 'LIFECYCLE'],
  ['Dialect', 'DIALECT'],
  ['Spark', 'SPARK'],
  ['Connector', 'CONNECTOR'],
  ['Host and client', 'HOST'],
];

const table = [];
const tableSizes = [];
for (let i = 0; i < FAMILIES.length; i++) {
  const at = section.indexOf(`**${FAMILIES[i][0]}**`);
  if (at < 0) {
    findings.push(`30 §6 has no ${FAMILIES[i][0]} family`);
    continue;
  }
  const next = i + 1 < FAMILIES.length ? section.indexOf(`**${FAMILIES[i + 1][0]}**`) : section.length;
  const codes = [...section.slice(at, next).matchAll(/^\| `([A-Z][A-Z0-9_]*)` \|/gm)].map((m) => m[1]);
  tableSizes.push(codes.length);
  table.push(...codes);
}

/* ── 2 · `REFUSAL_CODES`, family by family, so a code cannot move house unseen ── */

const ports = read('packages', 'ports', 'src', 'index.ts');
const declared = [];
const declaredSizes = [];
for (const [name, konst] of FAMILIES) {
  const m = new RegExp(`^const ${konst} = \\[([\\s\\S]*?)\\] as const;`, 'm').exec(ports);
  if (!m) {
    findings.push(`@braindog/ports has no ${konst} array (${name})`);
    continue;
  }
  const codes = [...m[1].matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((x) => x[1]);
  declaredSizes.push(codes.length);
  declared.push(...codes);
}

/* Every pair, both ways, because "the table gained a code" and "the array invented one" are
   different repairs — the same argument `event-kinds` makes about its five sources. */
for (const code of table) if (!declared.includes(code)) findings.push(`30 §6's table has \`${code}\` and REFUSAL_CODES does not`);
for (const code of declared) if (!table.includes(code)) findings.push(`REFUSAL_CODES has \`${code}\` and 30 §6's table does not`);

/* AND IN THE SAME FAMILY. A code that moves between families keeps the total and changes what it
   MEANS — `30 §2`'s own argument about its groups, and it holds here for the same reason. */
FAMILIES.forEach(([name], i) => {
  if (tableSizes[i] !== undefined && declaredSizes[i] !== undefined && tableSizes[i] !== declaredSizes[i])
    findings.push(`${name}: the table lists ${tableSizes[i]} and REFUSAL_CODES declares ${declaredSizes[i]}`);
});

/**
 * A spelled-out whole number, 0 to 999, or `undefined` for anything this cannot read.
 *
 * ONLY THE RANGE THE SENTENCE CAN OCCUPY. There are a hundred and twenty-six refusal codes and
 * `30 §6` is the only caller, so three digits is the whole requirement and a general English
 * number grammar would be the same mistake in the other direction.
 *
 * `and` IS OPTIONAL AND `-` IS NOT LOAD-BEARING. Both `One hundred and twenty-six` and
 * `One hundred twenty six` read as 126, because the point is to read what a person wrote in a
 * document rather than to hold them to a house style in a sentence nobody reformats on purpose.
 */
function words(said) {
  const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

  const parts = said.toLowerCase().replace(/-/gu, ' ').split(/\s+/u).filter((w) => w.length > 0 && w !== 'and');
  let total = 0;
  let seen = false;
  for (let at = 0; at < parts.length; at++) {
    const word = parts[at];
    if (parts[at + 1] === 'hundred') {
      const many = UNITS[word];
      if (many === undefined || many === 0) return undefined;
      total += many * 100;
      seen = true;
      at++;
      continue;
    }
    if (word === 'hundred') {
      /* A bare `Hundred`, which the old table also accepted. */
      if (seen) return undefined;
      total += 100;
      seen = true;
      continue;
    }
    if (TENS[word] !== undefined) {
      total += TENS[word];
      seen = true;
      continue;
    }
    if (UNITS[word] !== undefined) {
      total += UNITS[word];
      seen = true;
      continue;
    }
    return undefined;
  }
  return seen ? total : undefined;
}

/**
 * THE PARSER IS TESTED ON EVERY RUN, which is the condition for replacing a table with code in a
 * gate. A gate that silently mis-reads a number is worse than one that cannot read it: the old
 * table failed loudly and this could fail quietly, so it does not get to.
 */
for (const [text, want] of [['Ninety', 90], ['Ninety-nine', 99], ['One hundred', 100], ['Hundred', 100],
  ['One hundred and twelve', 112], ['One hundred and fifteen', 115], ['One hundred and seventeen', 117],
  ['One hundred and twenty-two', 122], ['One hundred and twenty-five', 125], ['One hundred and twenty-six', 126],
  ['One hundred and thirty', 130], ['Two hundred and one', 201], ['One hundred twenty six', 126],
  ['Eleventy-one', undefined], ['', undefined], ['Refusals', undefined]]) {
  const got = words(text);
  if (got !== want) findings.push(`this gate's own number reader is wrong: it reads "${text}" as ${got} and not ${want}`);
}

/* ── 3 · the sentence that counts ───────────────────────────────────────── */

/* ONE LINE, BECAUSE THE SENTENCE IS NOT. It wraps in the document, and a regex anchored to a line
   would report the sentence missing every time somebody reflowed the paragraph — a gate that goes
   red on a line break is a gate people learn to ignore. */
const flat = section.replace(/\s+/gu, ' ');
/* AND THE TOTAL IS SPELLED IN WORDS THAT MAY HOLD A SPACE. This matched `[A-Z][a-z-]+` — one
   capitalised, optionally hyphenated word — which reads `Ninety-nine` and cannot read `One hundred
   and twelve`. The moment the list passed a hundred the gate reported the sentence MISSING rather
   than the count wrong, which is the least useful thing it could have said about the change that
   was happening.

   THE WORDS WERE THEN A LOOKUP TABLE, and the argument for it was that five entries is cheaper
   than an English number grammar nobody will test. Eleven entries later, every single code added
   to this repository has cost somebody a second red gate and a one-line edit to a table of
   spellings — and the failure it gives them says `this gate cannot read as a number`, which
   sounds like a defect in their change and is not. A gate that manufactures work is a gate people
   route around. `words()` below reads the range this sentence can plausibly occupy, it is tested
   by `spelled()` beneath it on every run, and it costs nothing per code from here on. */
const counted = /([A-Z][a-z-]+(?: [a-z-]+)*), counted, in nine families — (\d+) pack and declaration · (\d+) grammar · (\d+) write path · (\d+) auth and vault · (\d+) format and lifecycle · (\d+) dialect · (\d+) spark · (\d+) connector · (\d+) host and client/.exec(flat);
if (!counted) {
  findings.push("30 §6's counting sentence is not where this gate looks for it");
} else {
  const said = words(counted[1]);
  if (said === undefined) findings.push(`30 §6 counts them as "${counted[1]}", which this gate cannot read as a number`);
  else if (said !== table.length) findings.push(`30 §6 says ${counted[1]} (${said}) and its table lists ${table.length}`);
  counted.slice(2).map(Number).forEach((n, i) => {
    if (tableSizes[i] !== undefined && n !== tableSizes[i])
      findings.push(`30 §6 counts ${n} ${FAMILIES[i]?.[0].toLowerCase()} and its own table lists ${tableSizes[i]}`);
  });
}

/* AND NO DUPLICATES. A list that says `FORBIDDEN` twice has ninety-eight codes and a count that
   agrees with nothing, and every comparison above still passes. */
for (const [what, list] of [['30 §6', table], ['REFUSAL_CODES', declared]]) {
  const seen = new Set();
  for (const code of list) {
    if (seen.has(code)) findings.push(`${what} lists \`${code}\` twice`);
    seen.add(code);
  }
}

/* ── 4 · what the code actually emits ───────────────────────────────────── */

/**
 * A code handed to a refusal constructor, or written as a `code:`.
 *
 * FOUR HELPERS, NOT ONE. The first version of this matched `no(` and `code:` only — and
 * `declare.ts`, the single largest emitter in the repository, builds every refusal through a local
 * `bad(code, fix, at, allowed)`. So the gate reported *39 emitted* over a scan that could not see
 * the file `04 §5` is about, and the six checks added the same afternoon moved the number by zero.
 *
 * A gate whose predicate cannot reach the biggest input is the failure this whole tools directory
 * exists to catch, made by the tool. The names are `no`, `bad`, `refuse` and `at`, counted from the
 * source rather than remembered: a fifth is a finding, because the number below would silently drop.
 *
 * AND IT MADE THE SAME MISTAKE A SECOND TIME, ON A `?`. Widened for `bad()` this still anchored the
 * code to the quote IMMEDIATELY after `code:`, and a refusal written
 *
 *     code: e instanceof BadLine ? "FILE_MALFORMED" : "IMPORT_FAILED"
 *
 * puts an expression there. (Double quotes, because this gate scans `tools/` and the first version
 * of this comment reported ITSELF as an invented code — which is at least evidence the widening
 * works.) Two codes were hiding behind one — `IMPORT_FAILED`, which appeared
 * nowhere else in the tree and so was outside the registry and invisible to the gate that counts
 * what is outside the registry, and `SCOPE_INSUFFICIENT`, which a test asserts on. The optional
 * middle group below crosses a ternary's condition and the trailing group takes its else arm, so a
 * two-armed `code:` is counted as the two codes it is. It deliberately stops at a newline and at a
 * quote: a pattern that would chew through a whole file to find an upper-case string would start
 * reporting SQL keywords and enum values as refusal codes, and a gate that cries wolf is a gate
 * people learn to read past — the failure the budget below is written to avoid.
 */
const EMITTED =
  /(?:code:\s*|\b(?:no|bad|refuse|at)\s*(?:<[^>]*>)?\(\s*)(?:[^'"\n]{0,160}\?\s*)?'([A-Z][A-Z0-9_]{2,})'(?:\s*:\s*'([A-Z][A-Z0-9_]{2,})')?/g;

const known = new Set(table);
const invented = new Map();
const emitted = new Set();
let scanned = 0;

/**
 * A SEEDED VIOLATION IS NOT AN EMITTER, and this counted two of them.
 *
 * `tools/gates/negative/` holds one small tree per gate, each seeded with the defect that gate is
 * meant to report. They are `.ts` files under `tools/`, so this walk read them like any other
 * source — and the day `refusal-fixtures` landed its negative, which seeds a `bad('ROW_LOCKED')`
 * and a `bad('HUMAN_ONLY')` for its own gate to find, this gate's headline went from 75 emitted to
 * 77. Two codes the PRODUCT emits nowhere, counted as emitted, because another gate needed
 * something to fail on.
 *
 * That is the shape this file exists to catch, arriving through the front door: a number propped
 * up by a fixture rather than by the thing it claims to measure. It was caught by two gates
 * disagreeing — `refusal-fixtures` said 75 named and this said 77 emitted — which is the argument
 * for having both.
 */
const SEEDED = `${sep}negative${sep}`;

/**
 * A CODE NAMED IN A COMMENT IS NOT AN EMITTER.
 *
 * This scanned raw file text, and the paragraph above naming two codes as an example put both of
 * them into this gate's count by being written. A gate whose number moves when somebody EXPLAINS
 * it is a gate reading its own commentary, and it is the third time that shape has turned up in
 * this directory: dead-copy counted a copy key named in prose, flags counted a flag named in prose,
 * and both blank comments for exactly this reason.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const readable = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

function walk(dir) {
  if (`${dir}${sep}`.includes(SEEDED)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDir(entry.name) && entry.name !== 'node_modules') walk(join(dir, entry.name));
      continue;
    }
    if (!['.ts', '.svelte', '.mjs'].includes(extname(entry.name))) continue;
    scanned += 1;
    const where = join(dir, entry.name).slice(root.length + 1).replaceAll('\\', '/');
    for (const m of readable(readFileSync(join(dir, entry.name), 'utf8')).matchAll(EMITTED))
      /* BOTH ARMS OF A TERNARY, and `m[2]` is `undefined` for the ordinary one-code case. */
      for (const code of [m[1], m[2]]) {
        if (code === undefined) continue;
        if (known.has(code)) emitted.add(code);
        else invented.set(code, [...(invented.get(code) ?? []), where]);
      }
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

/**
 * The budget: five, and it may only go down.
 *
 * Each of these is one of three things and the gate cannot tell which: a concept `30 §6` is missing
 * and should gain by amendment; a code that already exists under another name; or a placeholder
 * standing in for a refusal nobody has written. All three are fixed by a person reading the site.
 * What a gate can do is stop the number growing while that happens.
 *
 * TWENTY-SIX WERE SORTED ON 2026-09-08 AND SEVEN ARE LEFT. Six were renames onto codes that already
 * existed and five onto new codes whose old names were wrong about their own subject — `UNIMPLEMENTED`
 * and `NOT_IMPLEMENTED` name nothing at all, and `SCHEMA_UNAVAILABLE` involved no schema. Thirteen
 * concepts `30 §6` genuinely lacked were admitted by amendment, including a ninth family for the
 * boundary a request arrives through, which this document had never had. The seven that remain, each
 * for a stated reason rather than for want of a decision:
 *
 *   `DECLARATION_INVALID` (32)  the catch-all `declare.ts` leans on. A project of its own, and it is
 *                               the one number here that measures how much validation has no word.
 *   `INTERNAL` (3)              a handler that threw. NOT a refusal — it names no field and no
 *                               expectation, and there is nothing a caller can fix — so `30 §6`
 *                               deliberately does not carry it. It is emitted identically by both
 *                               hosts and the Worker, and moving fewer than three of them would buy
 *                               a lower number here and a product that answers differently
 *                               depending on where a customer runs it.
 *   `RECORD_NOT_EMPTY` GONE, 2026-09-10, in the one line this row said it would take. `seed`'s
 *                               was the last site, the kernel's import had already moved, both map
 *                               to 422, and nothing in this tree asserted on the old spelling.
 *   `WHERE_OPERATOR_UNSUPPORTED` GONE, 2026-09-10, and it had TWO sites rather than the one
 *                               recorded here: the rule linter's `each:` over a field that is
 *                               neither list nor enum, now `MATCH_OP_UNSUPPORTED`; and a
 *                               cursor-plus-order conflict in `list` that was not about a `where`
 *                               operator at all, now `VALUE_MALFORMED` at `cursor`. The count in
 *                               this table is of CODES and the drift is in SITES, which is how the
 *                               second one stayed invisible to the gate that measures the first.
 *   `SCOPE_INSUFFICIENT` GONE, 2026-09-10. `FORBIDDEN` with the remedy in the sentence, exactly as
 *                               `PERSON_REQUIRED` now is. Its one site was a ternary in `record`'s
 *                               `allows`, now two returns, and the assertions moved with it: one in
 *                               `mcp`'s tests and three in `record`'s.
 *   `NOPE` (2) · `SOMETHING_NOBODY_MAPPED` (1)  test fixtures, and both are LEFT ON PURPOSE. The
 *                               first is a stub refusal in a transaction test where the code is not
 *                               what is asserted; the second is the subject of its own test —
 *                               *"a code nobody enumerated is still a 422"* — and replacing it with
 *                               a real code would delete the assertion. These two are the honest
 *                               floor: the budget cannot reach zero without making a test worse,
 *                               which is worth knowing before somebody tries.
 */
const BUDGET = 4;
const codes = [...invented.keys()].sort();
/* THE BUDGET IS ABOUT A TREE WITH CODE IN IT. A fixture root holds a document and an array and no
   source at all, so counting emitted codes there measures nothing — and the slack rule below would
   report every fixture as an improvement. A gate that is red on its own negatives for the wrong
   reason teaches people to read past its output. */
const measured = scanned > 50;
if (measured && codes.length > BUDGET) {
  findings.push(`${codes.length} refusal codes are outside 30 §6's registry; the budget is ${BUDGET}`);
  for (const code of codes.slice(0, 30)) findings.push(`  \`${code}\` — ${[...new Set(invented.get(code))].slice(0, 3).join(', ')}`);
}

/* AND THE BUDGET IS NOT ALLOWED TO BE SLACK EITHER. A budget nobody lowers is a budget that stops
   meaning anything; when the count drops, this says so and asks for the number to come with it. */
if (measured && codes.length < BUDGET)
  findings.push(`only ${codes.length} codes are outside the registry now — lower the budget from ${BUDGET} to ${codes.length}`);

if (findings.length === 0) {
  console.log(
    `  refusals: ${table.length} codes in ${FAMILIES.length} families, three sources agree; ` +
      `${measured ? `${emitted.size} emitted, ${table.length - emitted.size} by nothing, ${codes.length} outside the list` : 'no source tree to measure'}`,
  );
} else {
  console.error(`\n  refusals: ${findings.length} finding(s) — 30 §6\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    "\n  30 §6 is the list's home. A code is the one part of a refusal a caller can branch on,\n" +
      '  and 10 §7 builds the agent contract on it: the refusal teaches, and it teaches from a code\n' +
      '  that is stable across versions.\n',
  );
  process.exitCode = 1;
}
