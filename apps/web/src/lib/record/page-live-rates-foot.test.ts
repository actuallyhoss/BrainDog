/**
 * Rates that are out of date are said once a page, at its foot, with the way to keep them current.
 *
 * The sentence used to be printed under every converted tile and had nothing to press. A tile still says which day's
 * rates it was converted at; that they are out of date, and what to do, is the page's one note (`footed`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { blockOf, footWords, footed, tileOf, type LiveBlock } from './page-live.ts';

const NOW = Date.parse('2026-10-13T09:00:00Z');

const fx = (more: Record<string, unknown> = {}) => ({ into: 'EGP', home: 'EGP', asOf: '2026-09-28', forward: false, stale: true, missing: [], ...more });

const reading = (more: Record<string, unknown> = {}) => ({ value: 4200000, unit: 'EGP', rows: 3, held: 3, met: null, refusals: [], ...more });

/** A block of tiles as the record answers one. */
const tiles = (...readings: unknown[]) =>
  ({ kind: 'stat', heading: 'Money', cells: readings.map(() => ({ metric: 'overdue' })), readings: readings.map((r) => ({ metric: 'overdue', label: 'Owed', reading: r })), rows: [], matched: 0, refusals: [] }) as never;

/** A page's blocks as the reader draws them: each block, then the foot. */
const page = (...answered: never[]): LiveBlock[] => footed(answered, answered.map((b) => blockOf(b, new Map(), NOW)), NOW);

const STALE = copy.figureConvertedStale('28 Sep 2026');

test('out of date rates are said once, at the foot, with the way to keep them current, and under no tile', () => {
  const blocks = page(tiles(reading({ fx: fx() }), reading({ fx: fx() })), tiles(reading({ fx: fx({ asOf: '2026-09-30' }) })));
  assert.equal(blocks.length, 3, 'two blocks of tiles and one note');
  const foot = blocks[2]!;
  assert.equal(foot.kind, 'note');
  assert.equal(foot.drawn, true);
  assert.equal(foot.body, footWords.ratesStale('28 Sep 2026'), 'the oldest day is the one named');
  assert.match(foot.body ?? '', /out of date/u);
  assert.match(foot.body ?? '', /\[Keep rates current\]\(\/automations\?new=action&preset=rates\)/u);
  assert.doesNotMatch(foot.body ?? '', /—/u);
  const notes = blocks.slice(0, 2).flatMap((b) => (b.metrics ?? []).map((m) => m.note));
  assert.equal(notes.length, 3);
  for (const note of notes) {
    assert.doesNotMatch(note ?? '', /out of date/u);
    assert.notEqual(note, STALE);
    assert.match(note ?? '', /(^| · )Converted at rates as of (28|30) Sep 2026\.$/u, 'a tile still says which day its rates are from');
  }
});

test('a page with no out of date rate gains nothing', () => {
  const answered = [tiles(reading({ fx: fx({ stale: false }) }), reading())];
  const drawn = answered.map((b) => blockOf(b, new Map(), NOW));
  const blocks = footed(answered, drawn, NOW);
  assert.equal(blocks, drawn, 'the same blocks, untouched');
  assert.equal(blocks[0]!.metrics![0]!.note?.endsWith(copy.figureConverted('28 Sep 2026')), true);
  assert.doesNotMatch(blocks[0]!.metrics![1]!.note ?? '', /Converted/u);
  assert.deepEqual(footed([], [], NOW), []);
});

test('a tile with a missing rate keeps its own sentence, and is not what the foot is about', () => {
  const parts = [{ amount: 100000, currency: 'EGP' }, { amount: 5000, currency: 'USD' }];
  const missing = reading({ value: null, unit: null, parts, fx: fx({ missing: ['USD to EGP'] }) });
  const alone = page(tiles(missing));
  assert.equal(alone.length, 1, 'a rate that is missing is not a rate out of date');
  assert.equal(alone[0]!.metrics![0]!.note, copy.figureNoRate('USD to EGP'));

  const both = page(tiles(missing, reading({ fx: fx() })));
  assert.equal(both.length, 2);
  assert.equal(both[0]!.metrics![0]!.note, copy.figureNoRate('USD to EGP'));
  assert.equal(both[1]!.body, footWords.ratesStale('28 Sep 2026'));
});

test('a tile drawn off a page, with no foot under it, still says its rates are out of date', () => {
  assert.equal(tileOf({ metric: 'overdue', reading: reading({ fx: fx() }) } as never).note?.endsWith(STALE), true);
});

test('a block that is not drawn does not ask for the foot', () => {
  const hidden = { ...(tiles(reading({ fx: fx() })) as object), drawn: false } as never;
  assert.equal(page(hidden).length, 1);
});
