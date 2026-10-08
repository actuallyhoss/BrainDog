/**
 * The records the gates draw beside their own: every one named here, and dropping one is red.
 *
 *   node --test tools/gates/test/variants.test.mjs
 *
 * WHY A NAMED LIST. `record.mjs`'s `VARIANTS` is read by `layout` and `a11y`, which draw whatever it holds, so a variant
 * taken out of it went with no finding: the gates measured less and printed the same green (PRF-A07, RQ-PRF-081). The
 * names below are what the gates must draw, and the list in `record.mjs` is held to them both ways: one missing is
 * red, and one added without being named here is red, because a record nobody named is a record nobody checks.
 *
 * `lived` IS NAMED AS WAITING, NOT LEFT OUT. PRF-B06 adds it, a self-host over the file PRF-A07's `lived.mjs` builds.
 * Its test below skips with that reason until it is in `VARIANTS`, and then runs and fails until `lived` moves from
 * `WAITING` to `DRAWN`, so the guard turns itself on the day the variant lands.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');
const RECORD = readFileSync(join(gates, 'record.mjs'), 'utf8');

/**
 * `record.mjs`'s `VARIANTS`, read from its source.
 *
 * NOT IMPORTED, because importing `record.mjs` starts the self-host's whole import graph (the kernel, the host, the
 * seed and SQLite) to read a list of three names, and a package half-way through a change elsewhere then fails this
 * file for a reason that is not about variants. The list is a literal; the day it is not, this says so.
 */
function variantsOf(source) {
  const at = source.indexOf('export const VARIANTS = [');
  const end = source.indexOf('\n];', at);
  if (at === -1 || end === -1) throw new Error('record.mjs no longer writes VARIANTS as a list: read it another way here');
  return new Function(`return ${source.slice(source.indexOf('[', at), end + 2)}`)();
}
const VARIANTS = variantsOf(RECORD);

/** Every variant the gates draw today, and what each is for (the reasons are written beside `VARIANTS`). */
const DRAWN = ['cloud', 'connected', 'busy'];
/** Named, and not drawn yet. */
const WAITING = ['lived'];

/** What is wrong with a list of variants against the names: each one missing, and each one nobody named. */
function unmatched(variants, drawn = DRAWN, waiting = WAITING) {
  const names = variants.map((v) => v.name);
  return [
    ...drawn.filter((n) => !names.includes(n)).map((n) => `${n} is not drawn`),
    ...names.filter((n) => !drawn.includes(n) && !waiting.includes(n)).map((n) => `${n} is drawn and not named`),
  ];
}

test('the gates draw every named variant, and nothing unnamed', () => {
  assert.deepEqual(unmatched(VARIANTS), []);
  assert.equal(new Set(VARIANTS.map((v) => v.name)).size, VARIANTS.length, 'a name is drawn twice');
});

/* THE SEEDED NEGATIVE, ONE PER NAME. A check that only ever saw the full list could be a check of nothing. */
test('dropping any one variant is red, naming it', () => {
  for (const name of DRAWN) {
    const dropped = VARIANTS.filter((v) => v.name !== name);
    assert.deepEqual(unmatched(dropped), [`${name} is not drawn`]);
  }
  assert.deepEqual(unmatched([...VARIANTS, { name: 'quiet', routes: ['/'] }]), ['quiet is drawn and not named']);
});

test('each variant draws at least one address of the app', () => {
  for (const v of VARIANTS) {
    assert.ok(Array.isArray(v.routes) && v.routes.length > 0, `${v.name} draws no address`);
    for (const r of v.routes) assert.match(r, /^\//u, `${v.name} draws ${r}, which is not an address of the app`);
  }
});

/* A NAME NOTHING BRANCHES ON IS THE BASE RECORD AGAIN, which is how the three variant builds once drew exactly what the
   main build drew. `record.mjs` must say each name somewhere besides its entry in the list. */
test('each variant is made different from the base record somewhere in record.mjs', () => {
  for (const v of VARIANTS) {
    const said = RECORD.split(`'${v.name}'`).length - 1;
    assert.ok(said >= 2, `${v.name} is in the list and nothing in record.mjs makes it different`);
  }
});

/* AND THE TWO GATES THAT DRAW RECORDS DRAW ALL OF THEM, not a hand-typed few. */
test('layout and a11y draw the whole list', () => {
  for (const gate of ['layout.mjs', 'a11y.mjs']) {
    const source = readFileSync(join(gates, gate), 'utf8');
    assert.match(source, /VARIANTS as RECORDS\b[^;]*from '\.\/record\.mjs'/u, `${gate} does not read record.mjs's variants`);
    assert.match(source, /\.\.\.RECORDS\.map\(/u, `${gate} does not draw every variant`);
  }
});

const LIVED = VARIANTS.some((v) => v.name === 'lived');
test(
  'lived is drawn and named',
  { skip: LIVED ? false : 'waits on PRF-B06, which adds the lived variant to record.mjs; it runs the day that lands' },
  () => {
    assert.ok(DRAWN.includes('lived'), 'lived is in VARIANTS now: move it from WAITING to DRAWN so dropping it is red');
  },
);
