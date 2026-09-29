/**
 * Every closed list says the same thing everywhere it is written. `52 §5.2`, `34 §6`.
 *
 *   node tools/gates/closed-lists.mjs
 *
 * `30 §2`: "the corpus's closed lists are its security argument. A list enforced only by a validator
 * is a list one code path forgets." Twenty-three of them are `CHECK (… IN (…))` in the DDL, so the
 * *database* refuses a ninth pack kind rather than merely the validator, and that argument only
 * holds while the `CHECK` and the document agree about what the list is.
 *
 * THEY ARE WRITTEN IN THREE PLACES AND EDITED IN ONE AT A TIME. `30 §1`'s SQL block is the schema a
 * person reads; `migrations/` is the schema that runs; `34 §6` is the table that counts
 * them. Somebody adding a state edits whichever of the three they had open. `30 §2`'s own margin
 * records what that costs: *"An earlier draft said four and a fifth over a DDL that already had
 * seven; fourteen more arrived with the seven new tables"*.
 *
 * WHAT THIS CHECKS, and it is the general case of what `event-kinds.mjs` does for the one list large
 * enough to have drifted three times:
 *
 *   1. Every `CHECK (col IN (…))` in `30 §1`'s SQL exists in the migrations, with the same members.
 *
 *      AND IT IS EVERY MIGRATION, NOT THE FIRST ONE, which is what this gate read for as long as it
 *      existed. SQLite cannot change a `CHECK` in place, so widening one means rebuilding the table:
 *      `CREATE TABLE x_next (… CHECK …)`, copy, `DROP TABLE x`, `ALTER TABLE x_next RENAME TO x`.
 *      Three migrations have done it (`0004` to `device_grant`, `0005` to `schedule`, `0008` to
 *      `suggestion`), and against `0001` alone the gate was comparing the document to three lists
 *      the database stopped enforcing. It went red when `30 §1` was corrected to the schema that
 *      actually runs, which is the wrong way round: the document told the truth and the gate called
 *      it drift. So the files are folded in order, and a drop and a rename move the lists with the
 *      table.
 *   2. And the reverse, which is the direction that actually bites: a constraint the DDL enforces
 *      and the document does not mention is a rule nobody can find out about by reading.
 *   3. `34 §6`'s counts match, for every list whose members that table spells out.
 *
 * THE `as const` COMPARISON IS NOT HERE YET. `52 §5.2` clause 3 maps each list to the TypeScript
 * array that owns it, and about half of those arrays do not exist. Adding a half-populated map would
 * make this gate assert a set of exemptions rather than a rule; the lists it does cover it covers
 * completely, and `event-kinds.mjs` holds the one that has the full five-way comparison.
 *
 *   4. Every SPELLED-OUT count of `render`'s block kinds, anywhere in the corpus's prose and
 *      comments, against `packages/render/src/kinds.ts`'s own `TABLE`, the one closed list here
 *      that is TypeScript rather than a `CHECK`, so checks 1 to 3 never look at it and a sentence that
 *      says "sixteen kinds" can go stale forever without any of them noticing.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import.
 *
 * THE WHOLE FILE IS INSIDE IT, helpers and tables included, and that is a choice rather than an
 * oversight. Five of the helpers below (`realKindCount`, `proseFiles`, `kindsDeclared`,
 * `kindsInReadme` and `named`) read `root`, `read`, `findings` or `readLists`, which were module
 * constants when this was a script. Hoisting them out would mean threading those values
 * through every call, which is a rewrite of a gate whose output has to stay byte-identical, so they
 * stay closures and the closure is this function. A module constant here would also be the root of
 * whoever imported this first, which in one process is the wrong root for every later caller.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims
 * this gate at a seeded tree with, and then to the repository this file sits in. `run.mjs` passes
 * the root it derived from its own location, because an imported gate shares the runner's working
 * directory and that is wherever the operator was standing.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default function closedLists(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

  /**
   * Every `CHECK (<col> IN ('a','b'))` in a piece of SQL, by the table and column it constrains.
   *
   * THE TABLE COMES FROM THE NEAREST `CREATE TABLE` ABOVE IT, because a column name alone is not a
   * key: `state` is constrained on five tables with five different lists, and comparing them by column
   * would report four findings about nothing and miss the one that matters.
   */
  function checks(sql, found = new Map()) {
    let table = '';
    for (const line of sql.split('\n')) {
      const created = /CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)\s*\(/.exec(line);
      if (created) table = created[1];
      /* A REBUILD IS A DROP AND A RENAME, and the lists move with the table. In statement order, so a
         file that creates `x_next`, drops `x` and renames `x_next` to `x` leaves `x` holding the new
         lists rather than none. */
      const dropped = /DROP TABLE (?:IF EXISTS )?([a-z_]+)/i.exec(line);
      if (dropped) for (const key of [...found.keys()]) if (key.startsWith(`${dropped[1]}.`)) found.delete(key);
      const renamed = /ALTER TABLE ([a-z_]+) RENAME TO ([a-z_]+)/i.exec(line);
      if (renamed)
        for (const key of [...found.keys()])
          if (key.startsWith(`${renamed[1]}.`)) {
            found.set(`${renamed[2]}.${key.slice(renamed[1].length + 1)}`, found.get(key));
            found.delete(key);
          }
      /* `CHECK (col IN (` may open on one line and close several below (`event.kind` spans seven), so
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

  /**
   * WHAT THIS RUN DID NOT LOOK AT, which is a third outcome and not a kind of pass.
   *
   * A check whose input is not in this tree has neither agreed nor disagreed, and the green line at
   * the bottom is a claim about the checks that ran. Anything dropped is named here and printed
   * beside that line, so the two can never be confused by a reader who does not already know how
   * many checks this gate has.
   */
  const notChecked = [];

  /**
   * How many of the three word-for-word list comparisons actually ran: the kinds table, the
   * extractors and the combinators.
   *
   * IT LIVES UP HERE BECAUSE TWO BLOCKS FAR APART FEED IT, and until now only one of them did. The
   * green line said "N of 2" while the gate made three such comparisons, so the kinds table moved no
   * number whether it ran or not, which is the condition the comment at the bottom of this file was
   * written to end.
   */
  let readLists = 0;

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
   * AND THE LISTS A LATER MIGRATION WIDENED, which nothing held to anything.
   *
   * `30 §1` is migration 0001 verbatim: `packages/kernel/test/migrate.test.ts` asserts it statement by
   * statement, so it CANNOT be corrected to the schema that is running, and the two checks above are
   * right to compare it with the first migration alone. The hole is on the other side. SQLite cannot
   * change a `CHECK` in place, so widening one means rebuilding the table, and three migrations have
   * done it: `0004` to `device_grant.reach`, `0005` to `schedule.kind`, `0008` to
   * `suggestion.body_kind`. Every one of those members is enforced by the database, is absent from the
   * DDL a person reads, and had nothing checking that the document mentions it at all.
   *
   * SO THE ANCHOR IS THE MIGRATION'S NUMBER. `30 §1`'s prose already names one of them the right way,
   * *"the seventh, `vault`, from kernel migration 4"*, and that phrasing is the rule: a migration
   * that widens a list says which migration it was, where the lists are counted. Matching on the
   * members instead would pass on the words `pack` and `call` appearing anywhere in a page of prose
   * about packs and calls.
   */
  const later = readdirSync(join(root, 'packages/kernel/src/migrations'))
    .filter((f) => /^\d{4}_.*\.ts$/.test(f))
    .sort();

  const live = new Map();
  for (const file of later) {
    const before = new Map(live);
    checks(read('packages/kernel/src/migrations', file), live);
    const n = Number(file.slice(0, 4));
    if (n <= 1) continue;
    for (const [where, members] of live) {
      const was = before.get(where);
      /* A TABLE THAT IS NEW IN THIS MIGRATION IS NOT A WIDENING. Its lists arrive with it, and whether
         the document carries the table at all is a different question from this one. */
      if (!was) continue;
      const added = members.filter((m) => !was.includes(m));
      if (added.length > 0 && !blueprint.includes(`kernel migration ${n}`))
        findings.push(`kernel migration ${n} widened ${where} with ${added.map((m) => `'${m}'`).join(', ')} and 30 never says so`);
    }
  }

  /**
   * `34 §6`'s table, for the lists it spells out.
   *
   * A COUNT LIKE `16 + 2 meta` OR `4 (+4 aliases, +\`hole\`)` IS SUMMED PER ITS OWN RULE, `52 §5.2`
   * clause 1. The first number is the list; a parenthesised aside is a note about neighbouring things
   * that are not in it, and adding it would make the table disagree with itself.
   */
  const CELL = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/;
  let counted = 0;

  /* §6'S TABLE AND NOT EVERY FOUR-COLUMN TABLE IN THE FILE. `34` has several with the same shape (the
     type scale, the fixture records, the Playwright specs) and reading those as closed lists reported
     findings about tables that are not making the claim this gate checks. */
  const grammars = read('docs/34-GRAMMARS.md');
  const from = grammars.indexOf('## 6 · Every closed list');
  const section = from < 0 ? '' : grammars.slice(from, grammars.indexOf('\n## ', from + 1));
  if (!section.includes('| List | Count |')) findings.push("34 §6's table is not where this gate looks for it");

  for (const line of section.split('\n')) {
    const row = CELL.exec(line);
    if (!row || row[1] === 'List' || row[1].startsWith('---')) continue;

    const [, list, count, members] = row;

    /* A CELL THAT CITES A SECTION OR EXPLAINS ITSELF IN PROSE IS A COUNT ONLY. `52 §5.2` clause 1.
       `Block kinds` cites "§2.1" and calls it one TypeScript table; `Suggestion body kinds` spells four and then
       explains a fifth that is never filed. Counting the words in either would be this gate asserting
       its own reading of a sentence, which is worse than not checking. So: every member is inside
       backticks, and anything outside them but the separators means the cell is prose. */
    /* THE MIDDLE DOT IS THE MEMBER SEPARATOR WHERE THERE IS ONE, and whitespace where there is not.
       Most cells are bare words (`register page block`) and a few carry a value with each member:
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

  /* AND A TABLE THIS READ NO ROW OF IS NOT A TABLE THAT AGREES. The header finding above fires only
     when the section is missing; every row of a section that IS there can still be skipped as prose
     or as a cell with no number, and `counted` would print 0 beside the word "add up". The same
     one-line guard `spelledOut` already carries, for the same reason. */
  if (counted === 0) findings.push("34 §6's table has no row this gate could read a count out of");


  /**
   * 4 · Every spelled-out count of the kinds, against `kinds.ts`'s own `TABLE`.
   *
   * A NUMBER WRITTEN IN WORDS IS STILL A CLAIM. `render`'s block kinds have moved several times in a
   * season (sixteen, then twenty, then twenty-six, then twenty-eight, now twenty-nine) and every
   * sentence that spelled the count out by hand was a place the move had to be repeated by hand. Three
   * of those sentences went stale at once and two were simply wrong, and the only reason it was ever
   * noticed was somebody counting by eye. This is that count, run every time instead.
   *
   * "KIND" IS NOT A WORD THIS CORPUS OWNS ONCE. Pack declarations have their own eight kinds
   * (`04-PACKS` §1: "is not one of the eight kinds of declaration"), schedule actions their own, a job's
   * transcript its own nine, `event.kind` its own thirty-nine (`event-kinds.mjs`), and ordinary English
   * says "two kinds of X" about nothing in particular. A bare "sixteen kinds" is therefore ambiguous
   * EVERYWHERE EXCEPT `packages/render`, the one place "kind" has no other referent to be. Outside it, a
   * spelled-out count is read as a claim about BLOCK kinds only when the word `block` sits right against
   * it (`sixteen block kinds`, `nineteen kinds of block`) because none of this corpus's OTHER closed
   * lists ever say that about themselves. Matching bare `kind(s)` everywhere would report `04 §1`'s eight
   * pack kinds as a wrong count of twenty-nine; matching nothing outside `packages/render` would miss
   * every doc written ABOUT this exact list. This is the narrowest rule that gets both right. It is not
   * a parser of English, and it does not try to catch every phrasing (`kinds.ts`'s own "Twenty-five,
   * counted." names no word "kind" at all and this gate cannot see it either).
   *
   * NUMBER WORDS ONLY GO TO FORTY. Twenty-nine is today's count with room to grow, and the largest
   * spelled-out count of anything called "kinds" anywhere in the corpus is `event-kinds`' own
   * thirty-nine, a different list entirely. Forty covers every real sentence without this table
   * pretending to parse English numbers in general.
   */
  const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

  const NUMBER_WORDS = new Map();
  ONES.forEach((w, i) => NUMBER_WORDS.set(w, i + 1));
  TEENS.forEach((w, i) => NUMBER_WORDS.set(w, i + 10));
  NUMBER_WORDS.set('forty', 40);
  /* Both the hyphenated form this corpus actually writes (`twenty-nine`) and the spaced one nobody has
     yet, because the day somebody does, this should already read it rather than go quietly blind. */
  for (const [base, tens] of [
    [20, 'twenty'],
    [30, 'thirty'],
  ]) {
    NUMBER_WORDS.set(tens, base);
    ONES.forEach((w, i) => {
      NUMBER_WORDS.set(`${tens}-${w}`, base + i + 1);
      NUMBER_WORDS.set(`${tens} ${w}`, base + i + 1);
    });
  }

  /* Longest first. Harmless either way under `\b` boundaries, since `twenty` failing to reach `kinds`
     through the `-nine` in its way just backtracks to try `twenty-nine` next, but cheaper without it. */
  const NUMBER_PATTERN = [...NUMBER_WORDS.keys()].sort((a, b) => b.length - a.length).join('|');

  /**
   * The sentences where a count of the kinds is HISTORY and not a claim about today.
   *
   * A gate that cannot tell those apart forces one of two bad outcomes: it is switched off, or the
   * record is edited until the gate is happy and the record stops being true. An ADR's title is the
   * decision as it was made on the day; a quotation of a sentence that used to be on a page is a
   * quotation; a sentence in the past tense about what a specification HAD is about what it had.
   *
   * MATCHED ON THE WORDS AND NOT ON A LINE NUMBER, so the exemption follows the sentence when the
   * file moves and lapses the moment somebody rewrites the sentence around it. Every entry carries
   * its reason, and a list nobody can read is a list that grows.
   */
  const HISTORICAL = [
    /* An ADR is titled with what was decided. There were sixteen kinds when ADR-056 was written. */
    'ADR-056 · Sixteen block kinds',
    /* Past tense, about what the specification held before the dialect was finished. */
    'had `{{path}}` and sixteen block kinds',
    /* Two research documents quoting a sentence that was on the home page and is not any more. */
    'the least understandable sentence on the page: "Sixteen block kinds',
    'the majority. "Sixteen block kinds over eight primitives" is',
    'it needs the noun spelled out, e.g. *Sixteen kinds of block',
  ];

  /** `NUM kinds` or `NUM block kinds`; group 2 is present only for the second shape. */
  const COUNT_OF_KINDS = new RegExp(`\\b(${NUMBER_PATTERN})\\s+(block\\s+)?kinds\\b`, 'gi');

  /**
   * The rest of `checks()`'s idiom: text, not import. Executing `kinds.ts` to read its own export
   * would need a TypeScript runtime and would learn only what `as const satisfies` already enforces at
   * compile time; what it CANNOT enforce is a sentence agreeing with it, which is the one thing counted
   * here by reading the table the way a person does: top-level entries, one per line.
   */
  function realKindCount() {
    const src = read('packages/render/src/kinds.ts');
    const start = src.indexOf('const TABLE = {');
    const end = src.indexOf('} as const satisfies');
    if (start < 0 || end < 0) return undefined;
    return [...src.slice(start, end).matchAll(/^ {2}([a-zA-Z]+):\s*\{/gm)].length;
  }

  /**
   * Every place a sentence about the block kinds is written: `docs/`, the source and the drawers of
   * every package, every app's source, the READMEs, and the top level of an untracked notes folder.
   *
   * `.ts` AND `.svelte` ON BOTH SIDES, which the first cut of this check got wrong in a way that
   * mattered: it read `packages/**\/svelte/**\/*.svelte` but not the `.ts` beside them, and
   * `apps/**\/src/**\/*.ts` but not the `.svelte` beside those. Two of the stale counts it was written
   * to catch were in exactly those two holes (`packages/render/svelte/index.ts` and
   * `apps/web/src/routes/p/[slug]/+page.svelte`), so the gate would have passed a tree it was supposed
   * to fail. A search scope that is narrower than the thing being searched is a gate with a blind spot.
   *
   * That folder is read one level only, on purpose: its subfolders are a session's scratch record, not a
   * place a count is meant to stay true.
   */
  function inSearchScope(rel) {
    return (
      /^docs\/.*\.md$/.test(rel) ||
      /^(packages|apps)\/.+\/(src|svelte)\/.*\.(ts|svelte)$/.test(rel) ||
      /^loop\/[^/]+\.md$/.test(rel) ||
      /(^|\/)README[^/]*\.md$/i.test(rel)
    );
  }

  /** Every gate that walks the tree shares `skipDir` (`lib.mjs`) rather than keeping its own stale copy. */
  function proseFiles(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (skipDir(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        proseFiles(p, out);
        continue;
      }
      const rel = relative(root, p).replace(/\\/g, '/');
      if (inSearchScope(rel)) out.push(rel);
    }
    return out;
  }

  /* A FIXTURE MISSING `kinds.ts` MUST NOT CRASH THE OTHER THREE CHECKS. This one is the only one of the
     four that reads outside `docs/30-BLUEPRINT.md`, `docs/34-GRAMMARS.md` and the migration, so it is
     also the only one a smaller fixture (this gate's own negative, for one) will not have. */
  /** Every kind `kinds.ts` declares, by name, read the way `realKindCount` reads the count. */
  function kindsDeclared() {
    const src = read('packages/render/src/kinds.ts');
    const start = src.indexOf('const TABLE = {');
    const end = src.indexOf('} as const satisfies');
    return new Set([...src.slice(start, end).matchAll(/^ {2}([a-zA-Z]+):\s*\{/gm)].map((m) => m[1]));
  }

  /** Every kind named in the README's one row per primitive, which is the only prose list of them. */
  function kindsInReadme() {
    const rows = [...read('packages/render/README.md').matchAll(/^\| `(?:panel|grid|rows|proportional|inline|list|table|media)` \| [^|]* \| ([^|]*) \|$/gm)];
    return new Set(rows.flatMap((r) => [...r[1].matchAll(/`([a-zA-Z]+)`/g)].map((m) => m[1])));
  }

  /** What one list has that the other does not, said in both directions. */
  function named(drawn, declared, what) {
    for (const k of declared) if (!drawn.has(k)) findings.push(`${what} does not name the kind "${k}"`);
    for (const k of drawn) if (!declared.has(k)) findings.push(`${what} names "${k}", which kinds.ts does not declare`);
    readLists++;
  }

  /**
   * ASKED FOR BY NAME, THE WAY THE EXTRACTORS BLOCK BELOW ASKS, and for the reason written out there:
   * an absent package is excused by name, and a file that is here and cannot be read is a finding.
   *
   * A BARE CATCH MAPPED BOTH ONTO ONE SENTENCE, AND THE SENTENCE WAS ABOUT THE WRONG THING.
   * `realKindCount` already returns `undefined` when the TABLE markers have moved, so the only thing
   * the catch ever caught was `read` failing to find the file at all. Aimed at a tree without
   * `packages/render` (this gate's own negative fixtures are small trees that carry only the files
   * their case needs) it reported that the TABLE was not where this gate looks, and sent a reader to
   * inspect a file that was never there. It also swallowed anything else thrown from that line, which
   * is the failure the extractors block was repaired for.
   */
  const kindsAt = join(root, 'packages', 'render', 'src', 'kinds.ts');
  const haveKinds = existsSync(kindsAt);
  const kindTotal = haveKinds ? realKindCount() : undefined;

  let spelledOut = 0;
  if (!haveKinds) {
    notChecked.push('the count and the list of the block kinds, for want of packages/render/src/kinds.ts');
  } else if (kindTotal === undefined) {
    findings.push("packages/render/src/kinds.ts's TABLE is not where this gate looks for it");
  } else {
    for (const rel of proseFiles(root)) {
      const lines = read(rel).split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(COUNT_OF_KINDS)) {
          const after = line.slice(m.index + m[0].length);
          /* `block` between the number and `kinds`, or right after `kinds` as `kinds of block(s)`: the
             two shapes this corpus uses when a sentence means THIS list rather than one of its several
             others also called "kinds". */
          const ofWhat = /^\s+of\s+(\w+)/i.exec(after)?.[1]?.toLowerCase();
          const namesBlockKinds = Boolean(m[2]) || ofWhat === 'block' || ofWhat === 'blocks';
          /* AND, INSIDE `packages/render` ITSELF, A BARE COUNT WITH NO "of" AT ALL, because "kind" has
             no other referent there to begin with. `kinds.ts` still says "Two kinds of row" about
             `queue`'s two row shapes, which is a real count of a real thing and not this one, so `of`
             FOLLOWED BY ANY OTHER NOUN still opts a bare match out even on `render`'s own ground. */
          const bareInRender = ofWhat === undefined && rel.startsWith('packages/render/');
          if (!namesBlockKinds && !bareInRender) continue;
          if (HISTORICAL.some((h) => line.includes(h))) continue;
          spelledOut++;
          const word = m[1].toLowerCase();
          const said = NUMBER_WORDS.get(word);
          if (said !== kindTotal) findings.push(`${rel}:${i + 1} spells the kind count as "${word}" (${said}) and kinds.ts has ${kindTotal}`);
        }
      });
    }
    /* CHEAP TO ASK, AND ONLY EVER ONE LINE: unlike a false match, a true absence has nothing further to
       report, so asking costs nothing and cannot turn into the noise the false-positive risk above is
       about. */
    if (spelledOut === 0) findings.push('no spelled-out count of the kinds was found anywhere this gate looked');

    /* AND THE ONE TABLE THAT NAMES THEM ALL, because a count agreeing is not the list agreeing.
       `packages/render/README.md` said "Twenty-nine kinds over eight primitives" over a table that
       named twenty, and a reader who trusted the table would never have learned that `queue`,
       `agents`, `split`, `bridge`, `series`, `lines`, `progress`, `forecast` and `sparkline` exist.
       A number is one character to keep in step and a list is one line per member, so the list is
       the one that goes stale, which is the argument for reading it rather than counting it. */
    /* AND THIS ONE IS ASKED FOR BY NAME TOO. `kinds.ts` being present says nothing about the README
       beside it, and an unguarded read here threw out of the whole gate, taking the three checks that
       have nothing to do with `packages/render` down with it. That is exactly what the comment above
       `kindsDeclared` promises will not happen. */
    if (existsSync(join(root, 'packages', 'render', 'README.md'))) {
      named(kindsInReadme(), kindsDeclared(), 'packages/render/README.md’s kinds table');
    } else {
      notChecked.push('the kinds table of packages/render/README.md against kinds.ts, for want of the README');
    }
  }

  /**
   * THE TEN EXTRACTORS AND THE THREE COMBINATORS, against `34 §6`'s row for them.
   *
   * A COUNT AGREEING IS NOT THE LIST AGREEING, which is the same argument the kinds table above makes
   * and the reason this is read rather than counted. The stake is different here, though: these
   * thirteen are the whole vocabulary a declaration may use to read a stranger's message, and the one
   * `switch` that refuses everything else (`43 §5.3`) is what keeps a payload from reaching code
   * nobody meant it to. A word in the document that the package does not implement is an author
   * writing a declaration that installs and never runs; a word in the package that the document does
   * not list is a surface nobody reviewed.
   *
   * MISSING THE PACKAGE IS NOT A FINDING, because the fixtures under `tools/gates/negative` are small
   * trees that carry only the files their own case needs, and a gate that demanded the whole
   * repository could not be aimed at one. That is why this is a note in green rather than an exit 3
   * or a finding: `closed-lists` reads four independent things and this is one of them, so a tree
   * without `packages/extract` costs one row and leaves the other three meaning exactly what they
   * say, and being aimed at one small tree is the designed use of this gate rather than a fault in
   * the tree.
   *
   * IT IS NOT SILENT EITHER, AND THAT IS THE REPAIR. The whole block sat inside a bare
   * `try {} catch {}` whose comment read *"One side or the other is not in this tree"*, and the green
   * line below names three counts, none of which is this one. Moving `packages/extract/src/extractors.ts`
   * aside and running this gate produced output byte-identical to a clean run: thirteen words that
   * decide what a declaration may do to a stranger's message, unchecked, and nothing said so.
   *
   * AND A BARE CATCH SWALLOWS MORE THAN THE CASE IT WAS WRITTEN FOR. `row[3].split('·')` destructured
   * into two, so an Extractors row reformatted without the middle dot left `drawnCombinators`
   * undefined and `doc.length` threw a `TypeError` into the same catch. The combinator half of the
   * check disappeared, silently, at the exact moment somebody edited the thing it validates. The
   * absence of the package is now asked for by name and everything else is a finding: a file that is
   * here and cannot be read has always been a finding in this directory, and only an absent one was
   * ever meant to be excused.
   */
  const extractorsAt = join(root, 'packages', 'extract', 'src', 'extractors.ts');
  if (!existsSync(extractorsAt)) {
    notChecked.push('the ten extractors and the three combinators of 34 §6, for want of packages/extract/src/extractors.ts');
  } else {
    const row = /^\| Extractors \| (\d+) \+ (\d+) \| ([^|]*) \|/m.exec(read('docs/34-GRAMMARS.md'));
    const src = readFileSync(extractorsAt, 'utf8');
    /* A LIST THIS GATE CANNOT FIND IS A FINDING, NOT AN EMPTY LIST. Unguarded, `indexOf` returning -1
       fed `slice(-1, end)` an empty string and the comparison went red naming `()`, which sends a
       reader to the document when the export had been renamed. */
    const listed = (name) => {
      const at = src.indexOf(`export const ${name} = [`);
      if (at < 0) {
        findings.push(`packages/extract/src/extractors.ts has no ${name} list this gate can read`);
        return null;
      }
      return [...src.slice(at, src.indexOf(']', at)).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    };
    const halves = row === null ? [] : row[3].split('·').map((half) => [...half.matchAll(/([a-z]+)/g)].map((m) => m[1]));
    if (row === null) findings.push('34 §6 has no Extractors row, and this gate reads the list from it');
    else if (halves.length !== 2)
      findings.push(`34 §6's Extractors row names ${halves.length} list(s), and this gate reads the extractors and the combinators either side of a ·`);
    else
      for (const [what, doc, said, code] of [
        ['extractor', halves[0], Number(row[1]), listed('EXTRACTORS')],
        ['combinator', halves[1], Number(row[2]), listed('COMBINATORS')],
      ]) {
        if (code === null) continue;
        if (doc.length !== said) findings.push(`34 §6 says ${said} ${what}s and names ${doc.length}`);
        /* IN ORDER, not as a set. `EXTRACTORS` is exported so a refusal can list the forms that do
           exist, and a list a person reads in a different order from the one the document taught them
           is a list they have to check twice. */
        if (doc.join(' ') !== code.join(' '))
          findings.push(`34 §6's ${what}s (${doc.join(' ')}) and extractors.ts's (${code.join(' ')}) are not the same list in the same order`);
        readLists++;
      }
  }

  if (findings.length === 0) {
    /* `readLists` IS IN THE SENTENCE, not merely in a skip line, because a count that never mentions
       a check cannot report that the check stopped running. Three numbers were printed here and the
       fourth check contributed none of them, which is why a permanently dead extractor comparison
       looked exactly like a passing one. */
    console.log(
      `  closed-lists: ${said.size} CHECKs agree across the document and the DDL, ${counted} counted lists add up, ` +
        `${spelledOut} spelled-out kind counts agree, and ${readLists} of 3 word-for-word lists match`,
    );
    for (const what of notChecked) console.log(`  closed-lists: NOT checked, ${what}`);
  } else {
    console.error(`\n  closed-lists: ${findings.length} finding(s) (34 §6, 30 §1, kinds.ts)\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    /* AND ON THE RED PATH TOO. A reader fixing these needs to know the list is not exhaustive. */
    for (const what of notChecked) console.error(`    NOT checked, ${what}`);
    console.error(
      '\n  A closed list is a security argument, not a tidiness one: a list enforced only by a\n' +
        '  validator is a list one code path forgets. A new member is a migration.\n',
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = closedLists() ?? 0;
