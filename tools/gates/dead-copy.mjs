/**
 * Every sentence this product types is a sentence somebody reads.
 *
 *   node tools/gates/dead-copy.mjs
 *
 * `50 §3`: "`copy.ts` is load-bearing twice: it is the only place a sentence is typed, so the
 * no-over-explaining rule (23 §7) is reviewable in one file." That is true only while the file's
 * contents and the product's contents are the same thing. Measured on the day this gate was
 * written: 212 keys, **26 of them referenced by no other file** — twelve per cent of everything
 * this product has to say, written, reviewed, shipped to the browser and rendered nowhere.
 *
 * IT IS A PARTICULAR KIND OF ROT AND IT LOOKS LIKE THE OPPOSITE. A dead string does not read as an
 * absence; it reads as a feature. Five definitions of the load-bearing nouns sat in `first-run.ts`
 * under a comment stating the policy in the completed past tense while the words they define reached
 * a screen undefined on every route. Somebody reviewing that file would have concluded the rule was
 * kept. The same shape, again: something complete-looking that reports success and does nothing.
 *
 * THE ALLOW-LIST IS THE POINT, NOT AN EXEMPTION. A gate that could only be green by fixing
 * twenty-six things at once is a gate that never lands. Every dead key is named here with what it is
 * waiting for, so the debt is a list somebody can read and shorten rather than a silence. Two
 * categories, and they are different facts:
 *
 *   - CORRECT: the string is dead because the surface is correctly absent. `askBrainDog` is the one
 *     — `23 §3.1` says a capability with no model behind it is "not there — not greyed out", so the
 *     control must not render and its sentence must still exist for the day it can.
 *   - UNBUILT: the surface the string belongs to has not been written. Each names it.
 *
 * ADDING A KEY TO THIS LIST IS A DECISION, and the diff shows it. Adding a dead key without one is
 * what this gate exists to stop.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { skipDir } from './lib.mjs';

const ROOT = process.env.BRAINDOG_GATE_ROOT ?? process.cwd();
const SRC = join(ROOT, 'apps', 'web', 'src');
const COPY = join(SRC, 'lib', 'copy.ts');

/**
 * Keys that are deliberately not rendered, and why.
 *
 * The `why` is not decoration: it is the difference between a debt and a mistake, and the only
 * thing that lets the next reader tell them apart without re-deriving the whole surface.
 */
const ALLOWED = new Map([
  ['askBrainDog', 'CORRECT — 23 §3.1: with no model the assistant is absent, not disabled. The sentence waits.'],
  ['tagline', 'UNBUILT — the slogan. `apps/site` renders it; the app has no surface that says its own name.'],
  ['promoted', 'UNBUILT — a suggested page moving into the rail writes nothing yet (29 §2 needs a nav write).'],
  ['restored', 'UNBUILT — Settings → backups (53 §5.4). No restore control exists.'],
  /* `markAllRead` LEFT THIS LIST WHEN IT GOT A SURFACE, and the gate is what noticed: an excuse that
     outlives its reason is the same defect as a sentence with no renderer, one direction along.
     `marked` is the per-item form and stays — the browser's mark is one instant, not a flag a row. */
  ['marked', 'UNBUILT — the PER-ROW read mark. Home marks the whole feed with one instant instead.'],
  ['rankedBy', 'UNBUILT — 19 §6\'s "For You" ordering.'],
  ['noFilters', 'UNBUILT — the filter bar\'s own empty state; the bar is hidden under 8 rows instead.'],
  ['displayOptions', 'UNBUILT — the display menu names its sections directly.'],
  ['saveAsView', 'UNBUILT — a saved view is seeded, never created from the grid.'],
  ['includesExample', 'UNBUILT — 19 §6 mechanism 2: the example row, marked and deletable in one click.'],
  ['example', 'UNBUILT — the chip that mark would render.'],
  ['offline', 'UNBUILT — 19 §6\'s "Offline and stale" surface.'],
  ['live', 'UNBUILT — same surface.'],
  ['polling', 'UNBUILT — same surface.'],
  ['stale', 'UNBUILT — same surface.'],
  ['saved', 'UNBUILT — same surface.'],
  ['reloaded', 'UNBUILT — same surface.'],
  ['stopped', 'UNBUILT — same surface.'],
  ['screenshotOn', 'UNBUILT — 19 §6\'s screenshot mode.'],
  ['screenshotOff', 'UNBUILT — same.'],
  ['appearance', 'UNBUILT — `/settings/[area]` title-cases the area id rather than naming it.'],
]);

const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    /* THE SAME DIRECTORIES EVERY OTHER GREP GATE SKIPS, and this was the only one that skipped
       none. Nothing under `src/` is skipped today, so this changes no number — it is here because
       the incident `lib.mjs` records is a scratch directory somebody left behind, and a scratch
       file naming a `copy.*` key would have kept that key alive from a file nobody ships. */
    if (skipDir(e.name)) continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) await walk(at);
    /* A TEST IS NOT A RENDERER. `deployment.test.ts` names twelve `copy.*` keys to assert the Cloud
       half exists at all, and every one of them then counted as rendered — so a screen could lose its
       only call site and this gate would say nothing, propped up by the file asserting the sentence
       is there. The gate's whole subject is a string that is reviewable and unrendered. */
    else if (/\.test\.ts$/.test(e.name)) continue;
    else if (/\.(ts|svelte)$/.test(e.name)) files.push(at);
  }
}
await walk(SRC);

/**
 * A COMMENT IS NOT A CALL SITE.
 *
 * This greps raw file text, so a key named in prose counted as rendered — and this repository's
 * comments name keys constantly. Three do it today: `pref.ts` explains why `copy.markAllRead` left
 * the allow-list, `data.ts` discusses `copy.lastDecided`, `schema.ts` `copy.levelMeans`. All three
 * are alive for other reasons, so the gate is not wrong about them; it is one deletion away from
 * being propped up by its own commentary, which is the shape `refusals` and `secret-grep` were
 * caught in.
 *
 * `flags.mjs` already had this exact function and the same paragraph. It is copied rather than
 * shared because the two gates want different things blanked — `flags` also blanks import
 * specifiers, and `copy` is never an import specifier.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const readable = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

const sources = new Map();
for (const f of files) sources.set(f, readable(await readFile(f, 'utf8')));

const copySrc = sources.get(COPY);
if (!copySrc) {
  console.log('  dead-copy: no apps/web/src/lib/copy.ts to read');
  process.exit(3);
}

/**
 * A MODULE NOTHING IMPORTS IS NOT A RENDERER.
 *
 * This treated all 81 non-copy files as renderers, and four of them are reachable from no route.
 * One of them, `EnvBadge.svelte`, was the only consumer of `copy.alpha` — so the word that tells
 * the alpha deployment apart from the real record was reported as rendered by a component that had
 * never been mounted, for as long as both existed. That is this gate's own subject: a sentence
 * written, reviewed, shipped and read by nobody, hidden one level up from the string.
 *
 * REACHABILITY FROM `src/routes`, because that is what SvelteKit renders. A file is a renderer if a
 * route imports it, or if something a route imports imports it. Measured on the tree the day this
 * landed: 4 orphans out of 81 files, 1 of which named a key — 0 false positives.
 */
const routes = files.filter((f) => f.includes(`${sep}routes${sep}`));
const reachable = new Set(routes);
for (const queue = [...routes]; queue.length > 0; ) {
  const at = queue.pop();
  /* THE SPECIFIER AS WRITTEN, then resolved two ways — `$lib/x.ts` is the app's own alias for
     `src/lib/x.ts`, and a relative one is relative to the importer. Anything else is a package, and
     a package does not hold this app's copy. */
  for (const m of (sources.get(at) ?? '').matchAll(/from\s*['"]([^'"\n]+)['"]/gu)) {
    const spec = m[1];
    const to = spec.startsWith('$lib/')
      ? join(SRC, 'lib', spec.slice(5))
      : spec.startsWith('.')
        ? resolve(dirname(at), spec)
        : null;
    if (to === null || reachable.has(to) || !sources.has(to)) continue;
    reachable.add(to);
    queue.push(to);
  }
}

/**
 * TOP-LEVEL KEYS ONLY — two spaces of indent. A nested key is reached through its parent, and
 * `copy.defines.list` is a use of `defines`; the unit test in `define.test.ts` is what checks that
 * every member of a nested table is named.
 *
 * A QUOTED KEY AND A `_`-PREFIXED ONE ARE SENTENCES TOO. The pattern read one character class and
 * nothing else, so `'not-found': …` — the plainest way to write a key that is not an identifier —
 * was not a key this gate had ever heard of. There is no such key in `copy.ts` today and the
 * widened pattern finds the same 399, which is the point: it costs nothing now, and it is not
 * sitting there waiting to be wrong on the day somebody writes one.
 */
const keys = [...copySrc.matchAll(/^ {2}(?:['"]([^'"]+)['"]|([A-Za-z_$]\w*))\s*:/gmu)].map((m) => m[1] ?? m[2]);

const dead = [];
for (const key of keys) {
  const used = new RegExp(String.raw`\bcopy\.${key}\b|\bcopy\[['"]${key}['"]\]`);
  let found = false;
  for (const [f, s] of sources) {
    if (f === COPY || !reachable.has(f)) continue;
    if (used.test(s)) {
      found = true;
      break;
    }
  }
  if (!found) dead.push(key);
}

const unexpected = dead.filter((k) => !ALLOWED.has(k));
/* SCOPED TO KEYS THAT ARE STILL IN THE FILE. An excuse for a key `copy.ts` no longer has is stale
   too, but it is a different fact and not a failure — and reporting it unscoped would make the
   gate's own negative fixture, whose `copy.ts` has none of these, red for twenty-six reasons that
   are not the seeded one. */
const revived = [...ALLOWED.keys()].filter((k) => keys.includes(k) && !dead.includes(k));
const gone = [...ALLOWED.keys()].filter((k) => !keys.includes(k));

/* BOTH SIDES OF THE WALK, PRINTED — because a number a gate does not print is a number nobody
   checks, and the first version of this line counted `copy.ts` on one side and not the other, so a
   two-file fixture reported "3 of 2". If the two ever read the same the reachability walk has
   stopped narrowing anything, which is either good news or a resolver quietly matching nothing, and
   from outside those look identical. */
const renderers = [...reachable].filter((f) => f !== COPY).length;
console.log(
  `  dead-copy: ${keys.length} sentences, ${dead.length} unrendered (${ALLOWED.size} known), over ${renderers} of ${files.length - 1} files a route reaches`,
);

if (unexpected.length) {
  console.error('\n  a sentence this product types and nobody reads:');
  for (const k of unexpected)
    console.error(`      copy.${k} — render it, delete it, or name it in tools/gates/dead-copy.mjs with what it waits for`);
}

/* AND A KEY THAT CAME BACK TO LIFE LEAVES THE LIST. Otherwise the list grows monotonically and
   stops being a description of the debt — which is the same failure as the strings themselves. */
if (revived.length) {
  console.error('\n  a known-dead sentence is now rendered, and its excuse is stale:');
  for (const k of revived) console.error(`      copy.${k} — remove it from ALLOWED in ${relative(ROOT, import.meta.filename)}`);
}

/* Not a failure: the key is gone, so the debt is paid. Printed so the list shortens rather than
   accumulating excuses for sentences that no longer exist. */
if (gone.length && keys.length > ALLOWED.size)
  console.log(`      (${gone.length} allow-listed key(s) no longer in copy.ts: ${gone.join(', ')})`);

if (unexpected.length || revived.length) process.exitCode = 1;
