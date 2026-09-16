/**
 * An enum's values with the words a person reads for them.
 *
 * `direction` holds `owed_to_me` and the screen says Money in. The column keeps the id, so no row
 * moves; a filter may say the id, its words, or the label, and one word always means one value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const OWNER = { actor: 'p_1' };

const money = (labels: Record<string, string>, type = 'enum'): Declaration => ({
  id: 'register.money',
  kind: 'register',
  body: {
    id: 'money',
    name: 'Money',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'direction', type, values: ['owed_by_me', 'owed_to_me'], labels, index: true },
    ],
  },
});

const LABELS = { owed_by_me: 'Money out', owed_to_me: 'Money in' };

test('A LABELLED ENUM INSTALLS, and a filter may say the label, the words or the id', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([money(LABELS)]);
  assert.ok(out.ok, JSON.stringify(out));
  assert.ok(k.create('money', { what: 'Invoice', direction: 'owed_to_me' }, OWNER).ok);
  assert.ok(k.create('money', { what: 'Rent', direction: 'owed_by_me' }, OWNER).ok);
  for (const where of ['direction is money in', 'direction is Money In', 'direction is owed to me', 'direction is owed_to_me']) {
    const listed = k.list({ register: 'money', where });
    assert.ok(listed.ok, `${where}: ${JSON.stringify(listed)}`);
    assert.deepEqual(listed.value.rows.map((r) => r.fields.what), ['Invoice'], where);
  }
  assert.equal(k.register('money')?.fields.find((f) => f.id === 'direction')?.labels?.owed_to_me, 'Money in');
});

test('a label for a value the enum does not hold, or on a field that is not an enum, is refused', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const unknown = await k.install([money({ owed_to_you: 'Money in' })]);
  assert.equal(unknown.ok, false);
  assert.equal(!unknown.ok && 'refusal' in unknown ? unknown.refusal.code : null, 'ENUM_VALUE_UNKNOWN');
  const text = await k.install([money({ owed_to_me: 'Money in' }, 'text')]);
  assert.equal(text.ok, false);
});

test('A LABEL THAT READS AS ANOTHER VALUE IS REFUSED, because a filter saying it could mean either', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([money({ owed_to_me: 'Owed by me' })]);
  assert.equal(out.ok, false);
  assert.match(!out.ok && 'refusal' in out ? out.refusal.fix : '', /reads as owed_by_me/);
  const blank = await k.install([money({ owed_to_me: '  ' })]);
  assert.equal(blank.ok, false);
});

test('A LABELLED ENUM SORTS BY THE LABEL THE COLUMN SHOWS, and pages the same way', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([money(LABELS)])).ok);
  for (const [what, direction] of [['Rent', 'owed_by_me'], ['Invoice', 'owed_to_me'], ['Tax', 'owed_by_me'], ['Retainer', 'owed_to_me']] as const)
    assert.ok(k.create('money', { what, direction }, OWNER).ok);
  const order = (dir: 'asc' | 'desc') => {
    const out = k.list({ register: 'money', order: [{ field: 'direction', dir }], limit: 10 });
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.rows.map((r) => r.fields.direction);
  };
  assert.deepEqual(order('asc'), ['owed_to_me', 'owed_to_me', 'owed_by_me', 'owed_by_me'], 'Money in comes before Money out');
  assert.deepEqual(order('desc'), ['owed_by_me', 'owed_by_me', 'owed_to_me', 'owed_to_me']);

  /* PAGED TWO AT A TIME, the cursor compares the label too, so no row is lost or repeated. */
  const first = k.list({ register: 'money', order: [{ field: 'direction', dir: 'asc' }], limit: 2 });
  assert.ok(first.ok && first.value.cursor);
  const second = k.list({ register: 'money', order: [{ field: 'direction', dir: 'asc' }], limit: 2, cursor: first.value.cursor! });
  assert.ok(second.ok, JSON.stringify(second));
  assert.deepEqual([...first.value.rows, ...second.value.rows].map((r) => r.fields.what).sort(), ['Invoice', 'Rent', 'Retainer', 'Tax']);
});
