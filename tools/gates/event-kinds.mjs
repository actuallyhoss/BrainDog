/**
 * The `event.kind` vocabulary says the same thing in five places. `52 §5.2`, `30 §2`.
 *
 *   node tools/gates/event-kinds.mjs
 *
 * `52 §5.2` picks this list out by name as "the one list large enough to have drifted three times",
 * and the drift is not hypothetical. `30 §2`'s own margin records an earlier draft that said four
 * closed lists over a DDL that already had seven. A vocabulary spread across a document's prose, a
 * document's SQL, a migration's `CHECK` and a TypeScript array drifts because each of the four is
 * edited by somebody looking at a different problem.
 *
 * WHAT MAKES IT WORTH A GATE RATHER THAN A TEST is that four of the five sources are not code. A
 * test can compare the array to the `CHECK`; nothing but this can notice that `30 §2`'s table gained
 * a row and the migration did not, which is the direction the drift actually goes: somebody
 * documents a kind, and the database then refuses to write it.
 *
 * AND THE WORD `Forty`. `30 §2` ends with a sentence of the shape "Forty, counted", then 10 row, 6 governance, 5 declaration, 5
 * credential · 5 ingest · 4 access · 5 lifecycle", and a sentence that counts is a sentence that can
 * be wrong. It is checked as a number and as seven group sizes, because a list can keep its total
 * while a kind moves between groups, and a kind's group is what it MEANS.
 *
 * THE PUNCTUATION BETWEEN `counted` AND THE FIRST NUMBER IS NOT PINNED, deliberately. It is an em
 * dash in the document today, and this gate used to hold one in its own pattern to match it. A
 * sweep that removed em dashes from the documents would then have taken this check out silently,
 * which is the failure mode the whole file is about. The pattern accepts whatever single mark sits
 * there.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A SOURCE THAT IS NOT THERE IS A FINDING AND NOT A SKIP, which is the opposite of the answer
 * `bundle` gives to the same question and is right for the opposite reason.
 *
 * Every file below is committed source. No command produces one, so a skip here could not print the
 * sentence a skip is for: there is nothing to tell a person to run. What absence actually means is
 * that the vocabulary has been LOST from one of the places that writes it down, arriving as a
 * deletion or a rename instead of as an edit, and that is the drift this gate exists to catch.
 * `no-declarations-in-kernel` makes the same call about migration 0002's one row, in the same words:
 * zero now is a mistake and not a thing nobody has written yet.
 *
 * AND ONE ABSENCE DOES NOT END THE RUN. Four sources with one gone still leaves pairs worth
 * comparing, and a gate that gave up on the lot would hide a real disagreement behind a missing
 * file. So this returns null and each source reports its own absence down the `error` channel
 * `eventCheck` already uses for a file it can open and cannot parse. Only ENOENT is caught: a
 * permission error or a bad encoding is this gate failing to read a file that is there, which is
 * not the same fact and must not be dressed up as one.
 */
const read = (root, ...parts) => {
  try {
    return readFileSync(join(root, ...parts), 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return null;
  }
};

/** Where each source lives, named once, so the finding for an absent one can say which file. */
const MIGRATION = 'packages/kernel/src/migrations/0001_kernel.ts';
const BLUEPRINT = 'docs/30-BLUEPRINT.md';
const EVENTS = 'packages/kernel/src/events.ts';

const absent = (path) => `${path} is not there, and it is one of the places the event.kind vocabulary is written down`;

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

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and everything
 * above this line is a declaration.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims
 * this gate at a seeded tree with, and then to the repository this file sits in. `run.mjs` passes
 * the root it derived from its own location, because an imported gate shares the runner's working
 * directory and that is wherever the operator was standing. `read` takes it rather than closing
 * over a module constant, because a module constant is the root of whoever imported this first.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default function eventKinds(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const sources = [];
  const findings = [];

  /* 1 · The DDL that actually runs. If any source is right, it is this one: the database refuses a
     forty-first kind, and everything else is a description of that. */
  const migration = read(root, MIGRATION);
  sources.push(
    migration === null ? { name: 'migration 0001', error: absent(MIGRATION) } : { name: 'migration 0001', ...eventCheck(migration, 'migration 0001') },
  );

  /* 2 · `30 §1`'s SQL block, which is the same DDL written down. The two are edited separately and
     that is exactly the problem. */
  const blueprint = read(root, BLUEPRINT);
  sources.push(blueprint === null ? { name: '30 §1 SQL', error: absent(BLUEPRINT) } : { name: '30 §1 SQL', ...eventCheck(blueprint, '30 §1') });

  /* 3 · `30 §2`'s table: seven rows of backticked words, one per group. This is the source a person
     reads, and the one most likely to gain a kind nothing else knows about. */
  const GROUPS = ['Rows', 'Governance', 'Declarations', 'Credentials', 'Ingest', 'Access', 'Lifecycle'];
  const table = [];
  const groupSizes = [];
  /* THE ABSENT DOCUMENT IS NAMED ONCE, NOT EIGHT TIMES. This section and the counting sentence below
     both read the same file, and running them against nothing would turn one deletion into seven
     missing rows plus a missing sentence, burying the one fact a person can act on. */
  if (blueprint !== null) {
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
  }

  /* 4 · `EVENT_KINDS`, which is what the code compares against. */
  const array = read(root, EVENTS);
  sources.push(
    array === null
      ? { name: 'EVENT_KINDS', error: absent(EVENTS) }
      : {
          name: 'EVENT_KINDS',
          members: [...array.matchAll(/^const [A-Z]+ = \[([^\]]*)\] as const;/gm)].flatMap((m) =>
            [...m[1].matchAll(/'([^']+)'/g)].map((k) => k[1]),
          ),
        },
  );

  for (const s of sources) if (s.error) findings.push(s.error);

  /* Every pair, both ways: a kind in one and not the other is a finding with a direction, because
     "the migration is missing `score`" and "the table invented `score`" are different repairs. */
  const ok = sources.filter((s) => s.members);
  for (const a of ok)
    for (const b of ok) {
      if (a === b) continue;
      for (const kind of a.members) if (!b.members.includes(kind)) findings.push(`${a.name} has \`${kind}\` and ${b.name} does not`);
    }

  /* 5 · The sentence that counts. A count in prose is a claim, and this one is made twice, once as a
     total and once as seven group sizes. */
  const counted =
    blueprint === null
      ? null
      : /\*\*(\w+), counted\s*\S\s*(\d+) row · (\d+) governance · (\d+) declaration · (\d+) credential · (\d+) ingest · (\d+) access · (\d+) lifecycle/.exec(
          blueprint,
        );
  if (blueprint === null) {
    /* Already a finding, named as the file it is. */
  } else if (!counted) findings.push("30 §2's counting sentence is not where this gate looks for it");
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
    console.error(`\n  event-kinds: ${findings.length} finding(s) (30 §2)\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    console.error(
      '\n  A new kind is a migration, and five places say what the vocabulary is: the migration,\n' +
        "  30 §1's SQL, 30 §2's table, 30 §2's counting sentence, and EVENT_KINDS.\n",
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = eventKinds() ?? 0;
