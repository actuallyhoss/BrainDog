/**
 * A block says what each figure it names is, as the record declares it (`figures`, `pages.ts` `figuresOf`).
 *
 * WHY. The web drew a figure's words, its door and its target from its own copy of the packs' figures, which it loaded
 * on every page open (about 30 KB compressed on a phone) to say figures the record had just read. The record says them
 * now, beside the figure, so the web's page path loads no copy (speed-e SE1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'kind', type: 'text' }, { id: 'cost', type: 'money' }] } as never,
};
const figure = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body: { window: '7d', compare: 'none', ...body } }) as never;
const OPEN = figure({ metric: 'things-open', name: 'Open things', source: 'register.things', where: 'kind is open', value: { count: 'id' }, format: 'int', target: { lte: 3 } });
const COST = figure({ metric: 'thing-cost', name: 'What one thing costs', source: 'register.things', where: 'what is {{it}}', value: { sum: 'cost' }, format: 'money', target: { gte: 0 } });
const BY_KIND = figure({ metric: 'things-by-kind', name: 'Things by kind', source: 'register.things', value: { count: 'id' }, format: 'int', target: { gte: 0 }, group_by: 'kind' });

async function seeded() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([THINGS, OPEN, COST, BY_KIND])).ok);
  assert.ok(k.create('things', { what: 'Kiln', kind: 'open', cost: { amount: 12000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  return { sql, k };
}

test('A STAT SAYS EACH OF ITS FIGURES BY ID WITH NO PARAMETER, as the record declares it', async () => {
  const { sql, k } = await seeded();
  const b = k.block({ kind: 'stat', cells: [{ metric: 'things-open' }, { metric: 'thing-cost:Kiln' }] } as never);
  assert.deepEqual(b.refusals, []);
  assert.deepEqual(Object.keys(b.figures ?? {}), ['things-open', 'thing-cost']);
  assert.deepEqual(b.figures?.['things-open'], { name: 'Open things', source: 'register.things', where: 'kind is open', value: { count: 'id' }, format: 'int', target: { lte: 3 } });
  /* THE PARAMETER IS THE HOST'S TO FILL, so the `where` comes as declared. */
  assert.equal(b.figures?.['thing-cost']?.where, 'what is {{it}}');
  sql.close();
});

test('A FIGURE SOURCE, A SERIES LINE AND A {{path}} ARE SAID TOO, filled or not, and a block naming none says an empty set', async () => {
  const { sql, k } = await seeded();
  const bar = k.block({ kind: 'bar', source: 'metric.things-by-kind' } as never);
  assert.deepEqual(Object.keys(bar.figures ?? {}), ['things-by-kind']);
  assert.equal(bar.figures?.['things-by-kind']?.group_by, 'kind');
  const note = k.block({ kind: 'note', body: 'Open: {{things-open}}. Spent on Kiln: {{thing-cost:Kiln}}.' } as never);
  assert.deepEqual(Object.keys(note.figures ?? {}).sort(), ['thing-cost', 'things-open']);
  /* A NOTE WHOSE HOLES NAME NO FIGURE answers `figures: {}`, so a host tells it from a record that never said. */
  const counted = k.block({ kind: 'note', body: '{{things.count}} things.' } as never);
  if (counted.values !== undefined) assert.deepEqual(counted.figures, {});
  /* A TABLE NAMES NO FIGURE, and carries no key. */
  assert.equal(k.block({ kind: 'table', source: 'register.things', columns: [{ field: 'what' }] } as never).figures, undefined);
  sql.close();
});

test('`figures` IS AN ANSWER KEY, so a held block keeps none and a block read back is answered its figures again', async () => {
  const { sql, k } = await seeded();
  assert.ok(ANSWER_KEYS.includes('figures'));
  const b = k.block({ kind: 'stat', cells: [{ metric: 'things-open' }] } as never);
  const again = k.block({ ...b, figures: { 'things-open': { name: 'Stale' } } } as never);
  assert.deepEqual(again.refusals, []);
  assert.equal(again.figures?.['things-open']?.name, 'Open things');
  sql.close();
});
