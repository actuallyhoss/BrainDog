/**
 * A walk to zero that never went under: the tile says how far the money lasts, where it drew a dash.
 *
 * The kernel sends no value for such a walk and, beside it, `beyond`: the last day the walk looked at
 * (`packages/kernel/src/money-figures.ts`). No value and no `beyond` is still a figure nobody could work out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MISSING } from 'braindog-render';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { tileOf } from './page-live.ts';

/** A walk's reading with no crossing, as the record sends one. */
const walked = (extra: Record<string, unknown> = {}) => ({ value: null, unit: null, rows: 3, held: 3, met: null, refusals: [], ...extra });

const tile = (reading: unknown, more: Record<string, unknown> = {}) => tileOf({ metric: 'runs-out-on', label: 'On what is due', reading, ...more } as never, undefined, 'bad');

test('a walk that never went under says the day the money lasts past', () => {
  const t = tile(walked({ beyond: { day: '2027-10-07', days: 365 } }));
  assert.equal(t.value, 'Lasts past 7 Oct 2027');
  assert.equal(t.value, copy.lastsPast('7 Oct 2027'));
  assert.equal(t.tone, undefined, 'money that lasts is no warning, and no verdict was measured');
  assert.equal(t.note, '', 'the sentence that cannot be worked out is not said under a figure that can');
  assert.equal(t.label, 'On what is due');
});

test('the count of days, which is the same walk, says the same day', () => {
  const t = tileOf({ metric: 'runway-days', reading: walked({ beyond: { day: '2027-10-07', days: 365 } }) } as never);
  assert.equal(t.value, 'Lasts past 7 Oct 2027');
});

test('under a label that already says lasts, the day is said without the word again', () => {
  const t = tileOf({ metric: 'runs-out-on', label: 'Lasts', reading: walked({ beyond: { day: '2027-10-07', days: 365 } }) } as never);
  assert.equal(t.value, 'Past 7 Oct 2027');
  assert.equal(t.value, copy.pastDay('7 Oct 2027'));
});

test('a note that names a figure with no value is not said under it', () => {
  const t = tile(walked({ beyond: { day: '2027-10-07', days: 365 } }), { note: 'In {{runway-days}}' });
  assert.equal(t.value, 'Lasts past 7 Oct 2027');
  assert.equal(t.note, '');
});

test('no value and no beyond is still the dash and the warning', () => {
  const t = tile(walked());
  assert.equal(t.value, MISSING);
  assert.equal(t.note, copy.figureUnavailable);
  assert.equal(t.tone, 'warn');
});

test('a beyond that is not a day and a whole count is not trusted', () => {
  for (const beyond of [null, 'soon', { day: 20271007, days: 365 }, { day: '2027-10-07', days: 1.5 }, { day: 'next year', days: 365 }, { day: '2027-10-07' }]) {
    const t = tile(walked({ beyond }));
    assert.equal(t.value, MISSING, JSON.stringify(beyond));
    assert.equal(t.tone, 'warn');
  }
});

test('a refused figure is not money that lasts, whatever rides beside it', () => {
  const refused = tile(walked({ beyond: { day: '2027-10-07', days: 365 }, refusals: [{ code: 'MIXED_CURRENCY', fix: 'no' }] }));
  assert.equal(refused.value, MISSING);
  const cell = tile(walked({ beyond: { day: '2027-10-07', days: 365 } }), { refusal: { code: 'METRIC_UNKNOWN', fix: 'no' } });
  assert.equal(cell.value, MISSING);
});

test('a figure with a value is drawn as it was, beyond or not', () => {
  const t = tileOf({ metric: 'tasks-done-7d', reading: { value: 4, unit: null, rows: 4, held: 9, met: null, refusals: [], beyond: { day: '2027-10-07', days: 365 } } } as never);
  assert.equal(t.value, '4');
});
