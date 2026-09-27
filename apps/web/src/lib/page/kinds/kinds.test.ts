/**
 * A block kind registered in `index.ts` is drawn from the record's own answer, through the path every page takes:
 * `page-live.ts` `blockOf` keeps the answer, and `blocks.ts` `draw`, which `PageView.svelte` and `DeclaredHome.svelte`
 * draw through, hands it to the kind's module before any arm of its own.
 *
 * THE ANSWER HERE IS THE KERNEL'S SHAPE, written out, because the record's half of the path is the kernel's own test
 * (`packages/kernel/test/kinds-registry.test.ts`) and this one begins where the answer arrives in the app.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from 'braindog-render';

import { draw } from '../../record/blocks.ts';
import { blockOf } from '../../record/page-live.ts';
import { BLOCK_KIND_DRAWERS, drawerOf } from './index.ts';

const NOW = Date.UTC(2026, 8, 9, 12);

/** What the stub writes into the one row it draws, so a test can tell its drawing from any other. */
const DRAWN_BY_STUB = 'drawn by the stub';

/* A KIND THAT COUNTS THE ROWS IT WAS ANSWERED, as one spec row, and draws every other kind's empty state over none. */
let asked = 0;
BLOCK_KIND_DRAWERS.stub = {
  draw: (result, opts) => {
    asked++;
    const n = Array.isArray(result.rows) ? result.rows.length : 0;
    if (n === 0) return { segments: [], refusal: opts.nothing() };
    return { segments: parse(['```spec', `Rows | ${n} | ${DRAWN_BY_STUB}`, '```'].join('\n'), { page: true }), refusal: null };
  },
};

const ROW = { id: '01J0000000000000000000000A', seq: 1, fields: { what: 'One' }, version: 1, created_at: '2026-09-01T00:00:00.000Z' };

/** A block as the record's `page` answers one: the declaration, with what the kernel read on it. */
const answered = (more: Record<string, unknown>) => ({ kind: 'stub', heading: 'Counted', source: 'register.nowhere', rows: [], matched: 0, refusals: [], ...more });

test('a registered kind is drawn by its own module, from the answer the record sent', () => {
  asked = 0;
  const live = blockOf(answered({ rows: [ROW, { ...ROW, seq: 2 }], matched: 2 }) as never, new Map(), NOW);
  assert.ok(live.answer, 'the reader did not keep the answer on a registered kind');
  assert.equal(live.cannot, undefined, 'a registered kind was said to be one this build cannot draw');
  assert.equal(live.shown, 2);

  const drawn = draw(live);
  assert.equal(asked, 1, 'the module was not asked');
  assert.equal(drawn.refusal, null);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  assert.equal(segment?.type === 'block' ? segment.rows[0]?.cells[2] : null, DRAWN_BY_STUB);
});

test('with nothing to draw, a registered kind says the empty state every kind says', () => {
  const drawn = draw(blockOf(answered({ empty: 'None counted.' }) as never, new Map(), NOW));
  assert.deepEqual(drawn.segments, []);
  assert.equal(drawn.refusal?.kind, 'no-results');
  assert.equal(drawn.refusal?.title, 'None counted.');
});

test('a block the record refused is said as every refused block is, and never reaches the module', () => {
  asked = 0;
  const live = blockOf(answered({ refusals: [{ code: 'DECLARATION_INVALID', fix: 'shade: is a word.' }] }) as never, new Map(), NOW);
  const drawn = draw(live);
  assert.equal(asked, 0, 'a refused block was handed to its module');
  assert.equal(drawn.refusal?.kind, 'error');
  assert.deepEqual(drawn.refusal?.lines, ['shade: is a word.']);
});

test('a kind that is not registered keeps no answer, and its drawing is not asked of any module', () => {
  asked = 0;
  const note = blockOf({ kind: 'note', heading: 'Words', body: 'A few words.', rows: [], matched: 0, refusals: [] } as never, new Map(), NOW);
  assert.equal(note.answer, undefined);
  draw(note);
  assert.equal(asked, 0);
  /* LOOKED UP AS AN OWN KEY, so a kind named for something every object has finds nothing. */
  assert.equal(drawerOf('constructor'), undefined);
  assert.equal(drawerOf('toString'), undefined);
});
