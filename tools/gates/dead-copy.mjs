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
import { join, relative } from 'node:path';

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
  ['tagline', 'UNBUILT — the marketing line. `apps/site` types its own; this one has no home in the app.'],
  ['promoted', 'UNBUILT — a suggested page moving into the rail writes nothing yet (29 §2 needs a nav write).'],
  ['restored', 'UNBUILT — Settings → backups (53 §5.4). No restore control exists.'],
  ['marked', 'UNBUILT — the read mark. `member.seen_at` (ADR-036) has no surface.'],
  ['markAllRead', 'UNBUILT — same read mark.'],
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
  ['rotated', 'UNBUILT — `/vault` prints its own literal instead. One of the two must go.'],
  ['staleKey', 'UNBUILT — same line on `/vault`.'],
  ['appearance', 'UNBUILT — `/settings/[area]` title-cases the area id rather than naming it.'],
  ['characterKeysHint', 'UNBUILT — `/settings/keyboard` is a heading and two unexplained buttons.'],
]);

const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const at = join(dir, e.name);
    if (e.isDirectory()) await walk(at);
    else if (/\.(ts|svelte)$/.test(e.name)) files.push(at);
  }
}
await walk(SRC);

const sources = new Map();
for (const f of files) sources.set(f, await readFile(f, 'utf8'));

const copySrc = sources.get(COPY);
if (!copySrc) {
  console.log('  dead-copy: no apps/web/src/lib/copy.ts to read');
  process.exit(3);
}

/* TOP-LEVEL KEYS ONLY — two spaces of indent. A nested key is reached through its parent, and
   `copy.defines.list` is a use of `defines`; the unit test in `define.test.ts` is what checks that
   every member of a nested table is named. */
const keys = [...copySrc.matchAll(/^ {2}([a-zA-Z]\w*)\s*:/gm)].map((m) => m[1]);

const dead = [];
for (const key of keys) {
  const used = new RegExp(String.raw`\bcopy\.${key}\b|\bcopy\[['"]${key}['"]\]`);
  let found = false;
  for (const [f, s] of sources) {
    if (f === COPY) continue;
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

console.log(`  dead-copy: ${keys.length} sentences, ${dead.length} unrendered (${ALLOWED.size} known)`);

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
