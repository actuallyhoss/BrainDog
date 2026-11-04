/**
 * `one-clock`: a run's `last_seen` is compared with the clock in one file, `packages/kernel/src/presence.ts`.
 *
 *   node tools/gates/one-clock.mjs [root]
 *
 * EIGHT READERS WORKED OUT "WORKING" EIGHT WAYS, and on the owner's record the foot of the rail said 4 working while two
 * of the four were last heard from two and four hours before. `presence.ts` is now the one clock (`WORKING_MS`,
 * `presenceOf`, `isStale`, `workingRuns`, `liveRuns`), and a reader that compares `last_seen` with the time in its own
 * words is the defect coming back. This gate is what makes that a red line and not a comment.
 *
 * WHAT A COMPARISON WITH THE CLOCK IS, read a line at a time, comments blanked:
 *   - IN CODE: a line that reads a run's last seen (`last_seen`, `lastSeen`, or a name bound from one in the 40 lines
 *     before), a `<`, `<=`, `>` or `>=`, and the clock (`now`, `nowMs`, `Date.now`, `clock`). So
 *     `now - Date.parse(run.fields.last_seen) < QUIET_MS` is a finding.
 *   - AN AGE: a name bound from the clock minus the last seen, compared with anything inside the 40 lines after. So
 *     `const age = Date.now() - seen;` and then `age > QUIET_MS` is a finding, on the second line.
 *   - IN SQL: the last seen, then a `<`, `<=`, `>` or `>=` against a bound value (`?`), which is always a moment worked
 *     out from the clock. So `json_extract(fields, '$.last_seen') > ?` is a finding.
 *
 * WHAT IS NOT. Showing "8m ago" is the time since, said, and compares nothing. Ordering by `last_seen` compares runs
 * with each other. A day's edge (`seen < dayStart`, `last_seen is today`) is a date, not a window on the clock.
 *
 * TODAY'S HITS ARE ALLOWED BY COUNT, AND THE LIST MAY ONLY SHRINK (`ALLOWED`). A file over its count is red on each of
 * its lines; a file under its count is red too, until the count is lowered, so a fix is written down where the next
 * reader sees it. Nothing is ever added to it: a new reader asks `presence.ts`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filesOf, isRepository, textOf } from './public-clean.mjs';

/** The one clock. Everything it holds may compare. */
export const CLOCK = 'packages/kernel/src/presence.ts';

/** This file, which names the patterns to define the rule. */
const SELF = 'tools/gates/one-clock.mjs';

/** What is read: the languages the product is written in. */
const SOURCE = /\.(?:[cm]?[jt]s|svelte)$/u;

/** A test, or a file only tests use: a test plants old clocks on purpose, to prove a reader ignores them. */
export const isTest = (rel) => /\.test\.[cm]?[jt]s$/u.test(rel) || /(?:^|\/)tests?\//u.test(rel) || /(?:^|\/)fixtures\//u.test(rel);

/**
 * Today's hits, file by count, measured on 9 October 2026. ONLY EVER LOWERED: each is a reader still to move onto
 * `presence.ts`, and the count is the lines the gate names in it.
 */
export const ALLOWED = {
  /* `workingAt`: the web's own 15 minutes, for a page's mark on the row an agent is on. */
  'apps/web/src/lib/record/api.ts': 1,
  /* The ladder's 45 minutes, twice in SQL: the run a write that names none is adopted into. */
  'packages/kernel/src/session.ts': 2,
  /* The runs-true sign: a week of runs. The runs still open long after they were heard from ask `openRunsHeard`. */
  'packages/kernel/src/signs.ts': 1,
  /* The briefing check: a run a briefing calls live, against `BRIEFING_LIVE_MS`. */
  'packages/record/src/signs.ts': 1,
};

/** How many lines after `const x = ...last_seen...` the name `x` still means the last seen. */
export const TAINT_LINES = 40;

const LAST = String.raw`\blast_seen\b|\blastSeen\b`;
/** A relational operator standing alone between spaces or a bracket: never `=>`, a generic or a tag. */
const RELATION = /(?:^|[\s)])(?:<=?|>=?)(?=[\s(])/u;
const CLOCK_WORD = /\b(?:now|nowMs|clock)\b|\bDate\.now\(/u;
/** A subtraction, which is what turns a moment and the clock into an age. */
const MINUS = /[\w)\]]\s*-\s*[\w(]/u;

/**
 * The code of each line of `text`, comments blanked: `/* *\/`, `<!-- -->` and a `//` that starts a line or follows a
 * space (so a URL in a string survives). Line numbers are kept.
 */
export function codeLines(text) {
  const out = [];
  let open = null;
  for (const raw of text.split('\n')) {
    let line = '';
    let rest = raw;
    while (rest.length > 0) {
      if (open !== null) {
        const end = rest.indexOf(open);
        if (end === -1) {
          rest = '';
          break;
        }
        rest = rest.slice(end + open.length);
        open = null;
        continue;
      }
      const block = rest.search(/\/\*|<!--/u);
      const slash = rest.search(/(?:^|\s)\/\//u);
      if (slash !== -1 && (block === -1 || slash < block)) {
        line += rest.slice(0, slash);
        rest = '';
      } else if (block !== -1) {
        line += rest.slice(0, block);
        open = rest.startsWith('/*', block) ? '*/' : '-->';
        rest = rest.slice(block + (open === '*/' ? 2 : 4));
      } else {
        line += rest;
        rest = '';
      }
    }
    out.push(line);
  }
  return out;
}

/** The names in `map` as alternatives of a pattern: the name itself, or `${name}` in a template. */
const namesOf = (map) => [...map.keys()].map((n) => n.replace(/\$/gu, '\\$')).map((n) => String.raw`\b${n}\b|\$\{${n}\}`);

/**
 * The line numbers of `text` that compare a run's last seen with the clock. A name bound from the last seen holds it
 * (`seen`); a name bound from the clock MINUS the last seen holds an age (`const age = Date.now() - seen`), and
 * comparing that age with anything is the clock, two lines apart. A line that ends on `<`, `<=`, `>` or `>=` (never
 * `=>`) is read with the next, so a comparison broken for width is still one.
 */
export function clockLines(text) {
  const lines = codeLines(text);
  const tainted = new Map();
  const aged = new Map();
  const hits = [];
  lines.forEach((one, i) => {
    for (const map of [tainted, aged]) for (const [name, until] of map) if (until < i) map.delete(name);
    const line = /(?<![=-])(?:<=?|>=?)\s*$/u.test(one) && i + 1 < lines.length ? `${one} ${lines[i + 1]}` : one;
    const names = namesOf(tainted);
    const seen = new RegExp([LAST, ...names].join('|'), 'u');
    const age = aged.size > 0 ? new RegExp(namesOf(aged).join('|'), 'u') : null;
    const at = line.search(seen);
    const sql = at !== -1 && new RegExp(String.raw`(?:${[LAST, ...names].join('|')})[^;]*?\s(?:<=?|>=?)\s*\?`, 'u').test(line.slice(at));
    if (sql || (RELATION.test(line) && ((at !== -1 && CLOCK_WORD.test(line)) || (age !== null && age.test(line))))) hits.push(i + 1);
    const bound = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u.exec(one);
    if (bound) {
      const rhs = one.slice(bound.index + bound[0].length);
      if (age?.test(rhs) || (seen.test(rhs) && CLOCK_WORD.test(rhs) && MINUS.test(rhs))) aged.set(bound[1], i + TAINT_LINES);
      else if (new RegExp(LAST, 'u').test(rhs)) tainted.set(bound[1], i + TAINT_LINES);
    }
  });
  return hits;
}

/**
 * The findings for `hits` (file to the lines that compare) against `allowed` (file to a count): every line of a file
 * over its count, and every allowance above what its file now holds, which is to be lowered.
 */
export function verdict(hits, allowed) {
  const findings = [];
  for (const [rel, lines] of hits) {
    const may = allowed[rel] ?? 0;
    if (lines.length > may)
      for (const line of lines)
        findings.push(
          `  ${rel}:${line}  compares a run's last_seen with the clock outside ${CLOCK}` +
            (may > 0 ? ` (${lines.length} here, ${may} allowed)` : '') +
            '; ask presenceOf, isStale, workingRuns or liveRuns instead',
        );
  }
  /* AND THE LIST ONLY SHRINKS: a count above what is there is a fix nobody wrote down. */
  for (const [rel, may] of Object.entries(allowed)) {
    const now = hits.get(rel)?.length ?? 0;
    if (now < may) findings.push(`  ${SELF}  allows ${rel} ${may} line(s), and it has ${now}: lower its count to ${now}${now === 0 ? ' (take it off the list)' : ''}`);
  }
  return findings;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function oneClock(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const all = filesOf(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (all === null || all.length === 0) {
    console.log(`  one-clock: no file to read under ${ROOT}`);
    return 3;
  }
  /* A PLANTED TREE OF ANOTHER GATE IS NOT THIS TREE, and the allowances are this repository's own paths. */
  const repository = isRepository(ROOT);
  const files = all.filter(
    (rel) => SOURCE.test(rel) && !isTest(rel) && rel !== CLOCK && rel !== SELF && !(repository && rel.startsWith('tools/gates/negative/')),
  );
  if (files.length === 0) {
    console.log(`  one-clock: no source file under ${ROOT}`);
    return 3;
  }
  const hits = new Map();
  for (const rel of files) {
    const text = textOf(ROOT, rel);
    if (text === null || !/last_seen|lastSeen/u.test(text)) continue;
    const lines = clockLines(text);
    if (lines.length > 0) hits.set(rel, lines);
  }
  const findings = verdict(hits, repository ? ALLOWED : {});

  const where = `${files.length} source file(s)`;
  if (findings.length === 0) {
    console.log(`  one-clock: ${where}, ${hits.size} file(s) on the allowed list, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  one-clock: ${where}, ${findings.length} finding(s).\n` +
      `  Whether a run is working, quiet or stale is asked of ${CLOCK}, never worked out from last_seen\n` +
      '  and the time in a reader of its own: that is how the rail, Today and Agents said three numbers.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = oneClock(process.argv[2]) ?? 0;
