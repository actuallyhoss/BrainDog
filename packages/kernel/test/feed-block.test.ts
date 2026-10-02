/**
 * A feed block on a page says a record setting itself up as one row, as Home's `whatsNew` does (`feed.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const OWNER = { actor: 'p_1' };

const GOALS: Declaration = {
  id: 'register.goals',
  kind: 'register',
  body: { id: 'goals', name: 'Goals', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'goal', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

test('A FEED BLOCK SAYS THE EXAMPLE ROWS AS ONE SETUP ROW, and a person’s own write after them as its own', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([GOALS]));
  for (const what of ['Run 5k', 'Read a book', 'Save for a bike']) value(k.create('goals', { what, tags: ['example'] }, OWNER));
  value(k.update('goals', 'goals#1', { goal: 'Stay fit' }, OWNER));
  value(k.create('goals', { what: 'Learn to swim' }, OWNER));

  const out = k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' });
  assert.deepEqual(out.refusals, []);
  const feed = out.feed ?? [];
  assert.equal(feed[0]?.kind, 'create');
  assert.equal(feed[0]?.thing, 'Learn to swim');
  const setup = feed.filter((r) => r.kind === 'setup');
  assert.equal(setup.length, 1, JSON.stringify(feed));
  assert.equal(setup[0]?.rows, 3);
  assert.equal(feed.filter((r) => r.kind === 'create' && r.thing !== 'Learn to swim').length, 0, 'no example row is listed on its own');
});

test('A LINE ABOUT A QUESTION NAMES WHAT IT ASKS, never its number', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([GOALS]));
  const options = [
    { id: 'yes', label: 'Raise it', because: 'The work grew', recommended: true },
    { id: 'no', label: 'Leave it', because: 'It is fair' },
  ];
  value(k.propose({ question: 'Raise the Kiln retainer?', body_kind: 'options', body: { options } }, 'slash'));
  const feed = k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' }).feed ?? [];
  const asked = feed.find((r) => r.kind === 'suggest');
  assert.ok(asked, JSON.stringify(feed));
  assert.match(String(asked.target), /^suggestion:SG\d+$/u);
  assert.equal(asked.thing, 'Raise the Kiln retainer?');
});
