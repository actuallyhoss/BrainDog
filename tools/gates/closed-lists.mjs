/**
 * Every closed list says the same thing everywhere it is written. `52 §5.2`, `34 §6`.
 *
 *   node tools/gates/closed-lists.mjs
 *
 * `30 §2`: "the corpus's closed lists are its security argument. A list enforced only by a validator
 * is a list one code path forgets." Twenty-three of them are `CHECK (… IN (…))` in the DDL, so the
 * *database* refuses a ninth pack kind rather than merely the validator — and that argument only
 * holds while the `CHECK` and the document agree about what the list is.
 *
 * THEY ARE WRITTEN IN THREE PLACES AND EDITED IN ONE AT A TIME. `30 §1`'s SQL block is the schema a
 * person reads; `migrations/0001_kernel.ts` is the schema that runs; `34 §6` is the table that counts
 * them. Somebody adding a state edits whichever of the three they had open. `30 §2`'s own margin
 * records what that costs: *"An earlier draft said four and a fifth over a DDL that already had
 * seven; fourteen more arrived with the seven new tables"*.
 *
 * WHAT THIS CHECKS, and it is the general case of what `event-kinds.mjs` does for the one list large
 * enough to have drifted three times:
 *
 *   1. Every `CHECK (col IN (…))` in `30 §1`'s SQL exists in the migration, with the same members.
 *   2. And the reverse, which is the direction that actually bites: a constraint the DDL enforces
 *      and the document does not mention is a rule nobody can find out about by reading.
 *   3. `34 §6`'s counts match, for every list whose members that table spells out.
 *
 * THE `as const` COMPARISON IS NOT HERE YET. `52 §5.2` clause 3 maps each list to the TypeScript
 * array that owns it, and about half of those arrays do not exist. Adding a half-populated map would
 * make this gate assert a set of exemptions rather than a rule; the lists it does cover it covers
 * completely, and `event-kinds.mjs` holds the one that has the full five-way comparison.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/**
 * Every `CHECK (<col> IN ('a','b'))` in a piece of SQL, by the table and column it constrains.
 *
 * THE TABLE COMES FROM THE NEAREST `CREATE TABLE` ABOVE IT, because a column name alone is not a
 * key: `state` is constrained on five tables with five different lists, and comparing them by column
 * would report four findings about nothing and miss the one that matters.
 */
function checks(sql) {
  const found = new Map();
  let table = '';
  for (const line of sql.split('\n')) {
    const created = /CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)\s*\(/.exec(line);
    if (created) table = created[1];
    /* `CHECK (col IN (` may open on one line and close several below — `event.kind` spans seven — so
       the members are collected from the opening line onward until the brackets balance. */
    const opened = /CHECK\s*\(\s*([a-z_]+)\s+IN\s*\(/i.exec(line);
    if (!opened) continue;
    const at = sql.indexOf(line) + line.indexOf(opened[0]);
    const close = sql.indexOf('))', at);
    const members = [...sql.slice(at, close).matchAll(/'([^']*)'/g)].map((m) => m[1]);
    found.set(`${table}.${opened[1]}`, members);
  }
  return found;
}

const findings = [];

const blueprint = read('docs/30-BLUEPRINT.md');
const migration = read('packages/kernel/src/migrations/0001_kernel.ts');

const said = checks(blueprint);
const runs = checks(migration);

if (said.size === 0) findings.push("30 §1's SQL block has no CHECK this gate can read");
if (runs.size === 0) findings.push('migration 0001 has no CHECK this gate can read');

for (const [where, members] of said) {
  const mirror = runs.get(where);
  if (!mirror) {
    findings.push(`30 §1 constrains ${where} and migration 0001 does not`);
    continue;
  }
  for (const m of members) if (!mirror.includes(m)) findings.push(`30 §1 admits ${where} = '${m}' and the migration does not`);
  for (const m of mirror) if (!members.includes(m)) findings.push(`the migration admits ${where} = '${m}' and 30 §1 does not`);
}

/* AND THE OTHER DIRECTION, which is the one that bites: a constraint the database enforces and the
   document does not mention is a rule nobody can find out about by reading. */
for (const where of runs.keys())
  if (!said.has(where)) findings.push(`migration 0001 constrains ${where} and 30 §1 does not mention it`);

/**
 * `34 §6`'s table, for the lists it spells out.
 *
 * A COUNT LIKE `16 + 2 meta` OR `4 (+4 aliases, +\`hole\`)` IS SUMMED PER ITS OWN RULE — `52 §5.2`
 * clause 1. The first number is the list; a parenthesised aside is a note about neighbouring things
 * that are not in it, and adding it would make the table disagree with itself.
 */
const CELL = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/;
let counted = 0;

/* §6'S TABLE AND NOT EVERY FOUR-COLUMN TABLE IN THE FILE. `34` has several with the same shape — the
   type scale, the fixture records, the Playwright specs — and reading those as closed lists reported
   findings about tables that are not making the claim this gate checks. */
const grammars = read('docs/34-GRAMMARS.md');
const from = grammars.indexOf('## 6 · Every closed list');
const section = from < 0 ? '' : grammars.slice(from, grammars.indexOf('\n## ', from + 1));
if (!section.includes('| List | Count |')) findings.push("34 §6's table is not where this gate looks for it");

for (const line of section.split('\n')) {
  const row = CELL.exec(line);
  if (!row || row[1] === 'List' || row[1].startsWith('---')) continue;

  const [, list, count, members] = row;

  /* A CELL THAT CITES A SECTION OR EXPLAINS ITSELF IN PROSE IS A COUNT ONLY — `52 §5.2` clause 1.
     `Block kinds` says "§2.1 — one TypeScript table"; `Suggestion body kinds` spells four and then
     explains a fifth that is never filed. Counting the words in either would be this gate asserting
     its own reading of a sentence, which is worse than not checking. So: every member is inside
     backticks, and anything outside them but the separators means the cell is prose. */
  /* THE MIDDLE DOT IS THE MEMBER SEPARATOR WHERE THERE IS ONE, and whitespace where there is not.
     Most cells are bare words — `register page block` — and a few carry a value with each member:
     the type scale is `t-xs 12 · t-sm 13 · …`, which is eight members and sixteen words. Splitting on
     both made it sixteen. */
  const words = [...members.matchAll(/`([^`]+)`/g)].flatMap((m) =>
    (m[1].includes('·') ? m[1].split('·') : m[1].split(/\s+/)).map((w) => w.trim()).filter(Boolean),
  );
  const prose = members.replace(/`[^`]+`/g, '').replace(/[\s·,]+/g, '');
  if (words.length === 0 || prose !== '') continue;

  /* `10 + 3` IS TWO LISTS IN ONE ROW and both count; `4 (+4 aliases)` is one list and an aside about
     things beside it, which adding would make the table disagree with itself. */
  const numbers = [...count.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  const total = /^\d+\s*\+\s*\d+/.test(count) ? (numbers[0] ?? 0) + (numbers[1] ?? 0) : numbers[0];
  if (total === undefined) continue;

  counted++;
  if (words.length !== total) findings.push(`34 §6 counts ${count} for ${list} and its own cell lists ${words.length}`);
}


if (findings.length === 0) {
  console.log(`  closed-lists: ${said.size} CHECKs agree across the document and the DDL, and ${counted} counted lists add up`);
} else {
  console.error(`\n  closed-lists: ${findings.length} finding(s) — 34 §6, 30 §1\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    '\n  A closed list is a security argument, not a tidiness one: a list enforced only by a\n' +
      '  validator is a list one code path forgets. A new member is a migration.\n',
  );
  process.exitCode = 1;
}
