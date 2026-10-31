/**
 * What a record says of its figures is what the page path draws them from (`figures-said.ts`, speed-e SE1), and the
 * page path loads none of this build's own tables.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FIGURES_KNOWN, knowFigures } from './figures-known.ts';
import { figuresFor, learnFigures } from './figures-said.ts';
import type { MetricDecl } from './metrics.ts';

const OPEN = { name: 'Open things', source: 'register.things', where: 'kind is open', value: { count: 'id' }, format: 'int', target: { lte: 3 } };

test('A FIGURE THE RECORD SAID IS KNOWN BY ITS ID, and the build’s own copy never writes over it', () => {
  learnFigures({ 'said-open': OPEN });
  assert.equal(FIGURES_KNOWN['said-open']?.metric, 'said-open');
  assert.equal(FIGURES_KNOWN['said-open']?.format, 'int');
  knowFigures({ 'said-open': { ...OPEN, metric: 'said-open', name: 'Built', window: '7d' } as unknown as MetricDecl });
  assert.equal(FIGURES_KNOWN['said-open']?.name, 'Open things');
});

test('A FIGURE SAID WITH NO TARGET IS KNOWN WITH NONE, and nothing malformed is kept', () => {
  const { target: _t, ...bare } = OPEN;
  learnFigures({ 'said-bare': bare, __proto__x: OPEN, 'said-bad': { name: 'No source', value: {} }, 'said-null': null });
  assert.deepEqual(FIGURES_KNOWN['said-bare']?.target, {});
  assert.equal(Object.hasOwn(FIGURES_KNOWN, 'said-bad'), false);
  assert.equal(Object.hasOwn(FIGURES_KNOWN, 'said-null'), false);
});

test('A BLOCK THAT SAYS ITS FIGURES OWES NOTHING; ONE FROM A RECORD BUILT BEFORE THEM LOADS THE BUILD’S TABLES', async () => {
  assert.equal(figuresFor([{ readings: [{ metric: 'said-open' }], figures: { 'said-open': OPEN } }]), null);
  assert.equal(figuresFor([{ readings: [{ metric: 'x' }], refusals: [{ code: 'FORBIDDEN' }] }]), null, 'a held block draws its refusal and owes nothing');
  assert.equal(figuresFor([{ kind: 'table', source: 'register.things' } as never]), null);
  const owed = figuresFor([{ readings: [{ metric: 'cash-now' }] }]);
  assert.ok(owed);
  await owed;
  assert.equal(FIGURES_KNOWN['cash-now']?.name, 'Cash now');
});

test('THE PAGE PATH IMPORTS NO COPY OF THE PACKS’ FIGURES: page-live and page-drawn learn them from the answer', () => {
  for (const file of ['./page-live.ts', './page-drawn.ts', './figures-known.ts', './figures-said.ts', './blocks.ts', './row-href.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import[^;]*from '(?:\.\/declared\.ts|@braindog\/seed[^']*)';/mu, `${file} imports the build's own figures`);
  }
});
