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
 * teaches itself from a code that is stable across versions. With nothing closing the list, an audit
 * counts **39 of the 99 emitted, 60 emitted by nothing, and 22 more that are not in the registry**.
 *
 * WHAT THIS GATE DOES, AND WHY IT IS A BUDGET RATHER THAN A RULE. Typing the field `RefusalCode`
 * today compiles against 41 call sites carrying codes that are not in the registry. Some of those
 * are concepts `30 §6` is missing and should gain by amendment (`ROUTE_UNKNOWN`, `PAGE_UNKNOWN`);
 * some are placeholders that should not exist at all (`UNIMPLEMENTED`, `INTERNAL`,
 * `SOMETHING_NOBODY_MAPPED`); and telling those apart is a judgement per site, not a rename. A
 * budget that may only go down measures the drift, makes a twenty-third invented code red today,
 * and lets the type narrow the day it reaches zero — which is the honest intermediate between a
 * list nothing enforces and 41 hurried guesses.
 *
 * The three sources, and the same shape `event-kinds` uses for the one other list this large:
 *
 *   1 · `30 §6`'s table — the home, and what a person reads.
 *   2 · `30 §6`'s counting sentence — *"Ninety-nine, counted, in eight families"* plus eight sizes.
 *       A sentence that counts is a sentence that can be wrong, and a family can gain a code while
 *       the total stays right if another loses one.
 *   3 · `REFUSAL_CODES` in `@braindog/ports`, which is what code compares against.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const findings = [];

/* ── 1 · the table, by family ───────────────────────────────────────────── */

const blueprint = read('docs', '30-BLUEPRINT.md');
const section = blueprint.slice(blueprint.indexOf('## 6 · The refusal model'), blueprint.indexOf('## 7 ', blueprint.indexOf('## 6 · The refusal model')));
if (section.length < 500) findings.push('30 §6 is not where this gate looks for it');

/** The families, in the order the counting sentence counts them. */
const FAMILIES = [
  ['Pack and declaration', 'PACK'],
  ['Grammar', 'GRAMMAR'],
  ['Write path', 'WRITE'],
  ['Auth and vault', 'AUTH'],
  ['Format and lifecycle', 'LIFECYCLE'],
  ['Dialect', 'DIALECT'],
  ['Spark', 'SPARK'],
  ['Connector', 'CONNECTOR'],
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

/* ── 3 · the sentence that counts ───────────────────────────────────────── */

/* ONE LINE, BECAUSE THE SENTENCE IS NOT. It wraps in the document, and a regex anchored to a line
   would report the sentence missing every time somebody reflowed the paragraph — a gate that goes
   red on a line break is a gate people learn to ignore. */
const flat = section.replace(/\s+/gu, ' ');
const counted = /([A-Z][a-z-]+), counted, in eight families — (\d+) pack and declaration · (\d+) grammar · (\d+) write path · (\d+) auth and vault · (\d+) format and lifecycle · (\d+) dialect · (\d+) spark · (\d+) connector/.exec(flat);
if (!counted) {
  findings.push("30 §6's counting sentence is not where this gate looks for it");
} else {
  const WORDS = { Ninety: 90, 'Ninety-nine': 99, 'One hundred': 100, Hundred: 100 };
  const said = WORDS[counted[1]];
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

/** A code handed to `no()` or written as a `code:`, which is every way one reaches a caller. */
const EMITTED = /(?:code:\s*|no<[^>]*>\(\s*|no\(\s*)'([A-Z][A-Z0-9_]{2,})'/g;

const known = new Set(table);
const invented = new Map();
const emitted = new Set();
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDir(entry.name) && entry.name !== 'node_modules') walk(join(dir, entry.name));
      continue;
    }
    if (!['.ts', '.svelte', '.mjs'].includes(extname(entry.name))) continue;
    scanned += 1;
    const where = join(dir, entry.name).slice(root.length + 1).replaceAll('\\', '/');
    for (const m of readFileSync(join(dir, entry.name), 'utf8').matchAll(EMITTED)) {
      if (known.has(m[1])) emitted.add(m[1]);
      else invented.set(m[1], [...(invented.get(m[1]) ?? []), where]);
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
 * The budget: twenty-two, and it may only go down.
 *
 * Each of these is one of three things and the gate cannot tell which: a concept `30 §6` is missing
 * and should gain by amendment; a code that already exists under another name; or a placeholder
 * standing in for a refusal nobody has written. All three are fixed by a person reading the site.
 * What a gate can do is stop the number growing while that happens.
 */
const BUDGET = 22;
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
    `  refusals: ${table.length} codes in eight families, three sources agree; ` +
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
