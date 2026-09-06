/**
 * The `event.kind` vocabulary says the same thing in five places. `52 §5.2`, `30 §2`.
 *
 *   node tools/gates/event-kinds.mjs
 *
 * `52 §5.2` picks this list out by name as "the one list large enough to have drifted three times",
 * and the drift is not hypothetical — `30 §2`'s own margin records an earlier draft that said four
 * closed lists over a DDL that already had seven. A vocabulary spread across a document's prose, a
 * document's SQL, a migration's `CHECK` and a TypeScript array drifts because each of the four is
 * edited by somebody looking at a different problem.
 *
 * WHAT MAKES IT WORTH A GATE RATHER THAN A TEST is that four of the five sources are not code. A
 * test can compare the array to the `CHECK`; nothing but this can notice that `30 §2`'s table gained
 * a row and the migration did not, which is the direction the drift actually goes — somebody
 * documents a kind, and the database then refuses to write it.
 *
 * AND THE WORD `Forty`. `30 §2` ends "Forty, counted — 10 row · 6 governance · 5 declaration · 5
 * credential · 5 ingest · 4 access · 5 lifecycle", and a sentence that counts is a sentence that can
 * be wrong. It is checked as a number and as seven group sizes, because a list can keep its total
 * while a kind moves between groups — and a kind's group is what it MEANS.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/** The quoted words of a `CHECK (kind IN (…))`, wherever it is written. */
function checkMembers(text, what) {
  const at = text.indexOf('CHECK (kind IN (');
  if (at < 0) return { error: `${what} has no CHECK (kind IN (…))` };
  const close = text.indexOf('))', at);
  return { members: [...text.slice(at, close).matchAll(/'([^']+)'/g)].map((m) => m[1]) };
}

/** The `event` table's own CHECK, out of a file that holds several tables' worth of them. */
function eventCheck(text, what) {
  const at = text.indexOf('CREATE TABLE event (');
  if (at < 0) return { error: `${what} has no CREATE TABLE event` };
  return checkMembers(text.slice(at, text.indexOf('\n);', at)), what);
}

const sources = [];
const findings = [];

/* 1 · The DDL that actually runs. If any source is right, it is this one: the database refuses a
   forty-first kind, and everything else is a description of that. */
sources.push({ name: 'migration 0001', ...eventCheck(read('packages/kernel/src/migrations/0001_kernel.ts'), 'migration 0001') });

/* 2 · `30 §1`'s SQL block, which is the same DDL written down. The two are edited separately and
   that is exactly the problem. */
const blueprint = read('docs/30-BLUEPRINT.md');
sources.push({ name: '30 §1 SQL', ...eventCheck(blueprint, '30 §1') });

/* 3 · `30 §2`'s table — seven rows of backticked words, one per group. This is the source a person
   reads, and the one most likely to gain a kind nothing else knows about. */
const GROUPS = ['Rows', 'Governance', 'Declarations', 'Credentials', 'Ingest', 'Access', 'Lifecycle'];
const table = [];
const groupSizes = [];
for (const group of GROUPS) {
  const row = new RegExp(`^\\|\\s*${group}\\s*\\|([^|]*)\\|`, 'm').exec(blueprint);
  if (!row) {
    findings.push(`30 §2's table has no ${group} row`);
    continue;
  }
  const kinds = [...row[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  groupSizes.push(kinds.length);
  table.push(...kinds);
}
sources.push({ name: '30 §2 table', members: table });

/* 4 · `EVENT_KINDS`, which is what the code compares against. */
const array = read('packages/kernel/src/events.ts');
const declared = [...array.matchAll(/^const [A-Z]+ = \[([^\]]*)\] as const;/gm)].flatMap((m) =>
  [...m[1].matchAll(/'([^']+)'/g)].map((k) => k[1]),
);
sources.push({ name: 'EVENT_KINDS', members: declared });

for (const s of sources) if (s.error) findings.push(s.error);

/* Every pair, both ways: a kind in one and not the other is a finding with a direction, because
   "the migration is missing `score`" and "the table invented `score`" are different repairs. */
const ok = sources.filter((s) => s.members);
for (const a of ok)
  for (const b of ok) {
    if (a === b) continue;
    for (const kind of a.members) if (!b.members.includes(kind)) findings.push(`${a.name} has \`${kind}\` and ${b.name} does not`);
  }

/* 5 · The sentence that counts. A count in prose is a claim, and this one is made twice — once as a
   total and once as seven group sizes. */
const counted = /\*\*(\w+), counted — (\d+) row · (\d+) governance · (\d+) declaration · (\d+) credential · (\d+) ingest · (\d+) access · (\d+) lifecycle/.exec(
  blueprint,
);
if (!counted) findings.push("30 §2's counting sentence is not where this gate looks for it");
else {
  const WORDS = { Thirty: 30, Forty: 40, Fifty: 50 };
  const said = WORDS[counted[1]];
  const total = ok[0]?.members.length ?? 0;
  if (said === undefined) findings.push(`30 §2 counts them as "${counted[1]}", which this gate cannot read as a number`);
  else if (said !== total) findings.push(`30 §2 says ${counted[1]} (${said}) and there are ${total}`);
  const sizes = counted.slice(2).map(Number);
  sizes.forEach((n, i) => {
    if (groupSizes[i] !== undefined && n !== groupSizes[i])
      findings.push(`30 §2 counts ${n} ${GROUPS[i]?.toLowerCase()} and its own table lists ${groupSizes[i]}`);
  });
}

/* AND NO DUPLICATES, in any of them. A list that says `edit` twice has thirty-nine kinds and a count
   that agrees with nothing, and every comparison above would still pass. */
for (const s of ok) {
  const seen = new Set();
  for (const kind of s.members) {
    if (seen.has(kind)) findings.push(`${s.name} lists \`${kind}\` twice`);
    seen.add(kind);
  }
}

if (findings.length === 0) {
  console.log(`  event-kinds: ${ok[0]?.members.length ?? 0} kinds, and ${ok.length} sources say the same`);
} else {
  console.error(`\n  event-kinds: ${findings.length} finding(s) — 30 §2\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    '\n  A new kind is a migration, and five places say what the vocabulary is: the migration,\n' +
      "  30 §1's SQL, 30 §2's table, 30 §2's counting sentence, and EVENT_KINDS.\n",
  );
  process.exitCode = 1;
}
