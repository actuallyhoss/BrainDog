/**
 * When a rule last fired, as `automations` answers it (`lastFired`).
 *
 * AN INLINE RULE LEAVES NO RUN, so its `last` is `null` however often it fired, and a screen had to read a page of the
 * log to say when. The record signs every write a rule makes `rule:<id>`, so it answers the instant itself: `null` for
 * a rule that has done nothing, the newest line it signed for an inline one, and when the newest run started for one
 * that leaves runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const HOUR = 3_600_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};
const rule = (id: string, body: Record<string, unknown>) => ({ id: `rule.${id}`, kind: 'rule' as const, body: { rule: id, ...body } as never });
/** Inline: a write to Bills sets a field in the same write. */
const STAMP = rule('stamp', { register: 'bills', on: 'create', when: 'what is Rent', then: [{ set: { field: 'note', to: 'seen' } }] });
/** Inline too, and nothing it waits for is ever written. */
const NEVER = rule('never', { register: 'bills', on: 'create', when: 'what is Nothing', then: [{ set: { field: 'note', to: 'never' } }] });
/** A run: started by a button. */
const BUTTON = rule('button', { on: { manual: true }, steps: [{ stop: true }] });

type Row = { rule: string; path: 'inline' | 'run'; last: { at: string } | null; lastFired: string | null };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, JSON.stringify(r));
  return x.value;
};
const iso = (ms: number): string => new Date(ms).toISOString();

test('AN INLINE RULE SAYS WHEN IT LAST FIRED FROM THE LOG, and one that never fired says null', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 3 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([BILLS, STAMP, NEVER]));
  const read = async (): Promise<Map<string, Row>> => new Map(value<Row[]>(await api.automations(undefined, owner)).map((r) => [r.rule, r]));

  /* NOTHING HAS FIRED YET. */
  let rows = await read();
  assert.equal(rows.get('stamp')!.lastFired, null);
  assert.equal(rows.get('never')!.lastFired, null);

  value(await api.create({ register: 'bills', fields: { what: 'Rent' } } as never, owner));
  rows = await read();
  assert.equal(rows.get('stamp')!.path, 'inline');
  assert.equal(rows.get('stamp')!.last, null, 'an inline rule leaves no run');
  assert.equal(rows.get('stamp')!.lastFired, iso(NOW - 3 * HOUR));
  assert.equal(rows.get('never')!.lastFired, null);

  /* A BILL IT DOES NOT MATCH MOVES NOTHING, and the next one it matches moves it to then. */
  clock.set(NOW - 2 * HOUR);
  value(await api.create({ register: 'bills', fields: { what: 'Water' } } as never, owner));
  assert.equal((await read()).get('stamp')!.lastFired, iso(NOW - 3 * HOUR));
  clock.set(NOW);
  value(await api.create({ register: 'bills', fields: { what: 'Rent' } } as never, owner));
  assert.equal((await read()).get('stamp')!.lastFired, iso(NOW));

  /* AND THE ONE READ BY NAME SAYS THE SAME. */
  assert.equal(value<Row>(await api.automations({ rule: 'stamp' }, owner)).lastFired, iso(NOW));
  sql.close();
});

test('A RULE THAT LEAVES RUNS FIRED WHEN ITS NEWEST RUN STARTED', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([BILLS, BUTTON]));
  assert.equal(value<Row[]>(await api.automations(undefined, owner))[0]!.lastFired, null);
  value(await api.automationRun({ rule: 'button' } as never, owner));
  clock.set(NOW);
  const row = value<Row[]>(await api.automations(undefined, owner))[0]!;
  assert.equal(row.path, 'run');
  assert.ok(row.last !== null);
  assert.equal(row.lastFired, iso(NOW - HOUR));
  sql.close();
});
