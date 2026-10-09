/**
 * An options question whose options carry the changes they make (F61, the gate's half).
 *
 * WHAT WAS MEASURED BEFORE THIS. A scheduled script could find that a monthly payment falls on the 29th and ask "the last
 * day, or the 29th?", but an option was words only: picking one wrote nothing, so the script had to run again to read
 * the answer and make the change itself, a second time, signed by itself. Now each option may carry `patches`, checked
 * as a rowset's updates are when it is filed, and the one picked is written at the press, as the person, in the
 * decision's batch, all of it or none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import type { Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 6);

const RECURRING: Declaration = {
  id: 'register.recurring',
  kind: 'register',
  body: {
    id: 'recurring',
    name: 'Repeating',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'day_of_month', type: 'text' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false, 'this was supposed to be refused');
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([RECURRING]));
  for (const name of ['Rent', 'Phone']) value(k.create('recurring', { name }, { actor: 'p_owner' }));
  return { k, sql };
}

/** What money-core's last-day script asks, as script-run files it: an id and a because on each option. */
const LAST_DAY = (versions: [number, number] = [1, 1]) => ({
  question: 'Rent and Phone fall on the 29th. Should they move to the last day of the month?',
  body_kind: 'options' as const,
  cause: 'money.last-day',
  body: {
    about: 'Rent, Phone',
    options: [
      {
        id: 'last',
        label: 'The last day of the month',
        because: 'A short month has no 29th.',
        patches: [
          { at: 'recurring#1', version: versions[0], patch: { day_of_month: 'last' } },
          { at: 'recurring#2', version: versions[1], patch: { day_of_month: 'last' } },
        ],
      },
      { id: 'keep', label: 'Keep the 29th', because: 'February moves it to the 28th anyway.' },
    ],
  },
});

const day = (sql: NodeSql, seq: number) => {
  const r = sql.one<{ fields: string; version: number }>("SELECT fields, version FROM entry WHERE register = 'recurring' AND seq = ?", seq)!;
  return { day: (JSON.parse(r.fields) as { day_of_month?: string }).day_of_month ?? null, version: r.version };
};

test('A PICK WRITES ITS PATCHES: as the person deciding, in the decision batch, so Activity reads it as one', async () => {
  const { k, sql } = await record();
  const filed = value<Filed>(k.propose(LAST_DAY(), 'S1'));
  const out = value<{ decision: string; batch: string; wrote: string[]; status: string }>(k.decide(filed.id, { decide: { option: 'last', reason: 'Yes, the last day.' } }, 'p_owner'));
  assert.equal(out.status, 'resolved');
  assert.equal(out.wrote.length, 2);
  assert.deepEqual([day(sql, 1), day(sql, 2)], [{ day: 'last', version: 2 }, { day: 'last', version: 2 }]);
  /* Every write is signed by the person and wears the decision's batch, beside the decide and resolve events. */
  const writes = sql.all<{ actor: string; batch: string }>("SELECT actor, batch FROM event WHERE target IN (?, ?) AND kind <> 'create'", `entry:${out.wrote[0]}`, `entry:${out.wrote[1]}`);
  assert.ok(writes.length >= 2);
  for (const w of writes) assert.deepEqual({ ...w }, { actor: 'p_owner', batch: out.batch });
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(DISTINCT batch) AS n FROM event WHERE batch = ? AND kind IN ('decide', 'resolve')", out.batch)!.n, 1);
});

test('THE OPTION NOT PICKED WRITES NOTHING', async () => {
  const { k, sql } = await record();
  const filed = value<Filed>(k.propose(LAST_DAY(), 'S1'));
  const out = value<{ wrote: string[] }>(k.decide(filed.id, { decide: { option: 'keep', reason: 'Leave them.' } }, 'p_owner'));
  assert.deepEqual(out.wrote, []);
  assert.deepEqual([day(sql, 1), day(sql, 2)], [{ day: null, version: 1 }, { day: null, version: 1 }]);
});

test('A STALE VERSION WRITES NONE: the entry is named, nothing is decided, and the question waits', async () => {
  const { k, sql } = await record();
  const filed = value<Filed>(k.propose(LAST_DAY(), 'S1'));
  value(k.update('recurring', 'recurring#2', { day_of_month: '30' }, { actor: 'p_owner' }));
  const no = refusal(k.decide(filed.id, { decide: { option: 'last', reason: 'Yes.' } }, 'p_owner'));
  assert.equal(no.code, 'VERSION_STALE');
  assert.match(no.fix, /^"Phone" changed after this was asked, so none of this option was written\./u);
  assert.doesNotMatch(no.fix, /recurring#|—/u);
  assert.deepEqual(day(sql, 1), { day: null, version: 1 }, 'the fresh one is not written either');
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', filed.id)!.status, 'open');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM decision')!.n, 0);
});

test('FILED TWICE GIVES ONE: the second run of the script joins the open question', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(LAST_DAY(), 'S1'));
  assert.deepEqual({ ...value<Filed>(k.propose(LAST_DAY(), 'S2')) }, { id: first.id, joined: true });
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 1);
  /* And once picked, the next run is answered with the pick and files nothing. */
  value(k.decide(first.id, { decide: { option: 'keep', reason: 'Leave them.' } }, 'p_owner'));
  const third = value<Filed>(k.propose(LAST_DAY(), 'S3'));
  assert.equal(third.answered?.said, 'Keep the 29th');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')!.n, 1);
});

test('PATCHES ARE CHECKED WHEN FILED, as a rowset update is, and a bad one files nothing', async () => {
  const { k, sql } = await record();
  const withPatches = (patches: unknown) => {
    const ask = LAST_DAY();
    return { ...ask, body: { ...ask.body, options: [{ ...ask.body.options[0], patches }, ask.body.options[1]] } };
  };
  const at = (patches: unknown) => refusal(k.propose(withPatches(patches), 'S1')).at;
  assert.equal(at([]), 'body.options[0].patches');
  assert.equal(at([{ at: '01JABCDEF', version: 1, patch: { day_of_month: 'last' } }]), 'body.options[0].patches[0].at');
  assert.equal(at([{ at: 'recurring#9', version: 1, patch: { day_of_month: 'last' } }]), 'body.options[0].patches[0].at');
  assert.equal(at([{ at: 'recurring#1', patch: { day_of_month: 'last' } }]), 'body.options[0].patches[0].version');
  assert.equal(at([{ at: 'recurring#1', version: 1, patch: {} }]), 'body.options[0].patches[0].patch');
  assert.equal(refusal(k.propose(withPatches([{ at: 'nosuch#1', version: 1, patch: { a: 1 } }]), 'S1')).code, 'REGISTER_UNKNOWN');
  /* A row id names no list, so it says which with `register`. */
  const id = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'recurring' AND seq = 1")!.id;
  value(k.propose(withPatches([{ register: 'recurring', at: id, version: 1, patch: { day_of_month: 'last' } }]), 'S1'));
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')!.n, 1);
});

test('A PICK NEVER HIDES A NEW ENTRY: the same cause asking about one it did not reach is filed', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(LAST_DAY(), 'S1'));
  value(k.decide(first.id, { decide: { option: 'last', reason: 'Yes, the last day.' } }, 'p_owner'));
  /* Next month a third line falls on the 29th, and the script asks about it under the same cause. */
  value(k.create('recurring', { name: 'Gym' }, { actor: 'p_owner' }));
  const ask = LAST_DAY();
  const gym = { at: 'recurring#3', version: 1, patch: { day_of_month: 'last' } };
  const next = { ...ask, question: 'Gym falls on the 29th. Should it move to the last day of the month?', body: { about: 'Gym', options: [{ ...ask.body.options[0], patches: [gym] }, ask.body.options[1]] } };
  const filed = value<Filed>(k.propose(next, 'S2'));
  assert.equal(filed.answered, undefined, 'the pick for Rent and Phone answered a question about Gym');
  assert.notEqual(filed.id, first.id);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 1);
});

test('A PATCH OUTSIDE ITS LIST IS REFUSED: an entry of another list, named or by its row id', async () => {
  const { k, sql } = await record();
  value(await k.install([{ id: 'register.people', kind: 'register', body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never }]));
  value(k.create('people', { name: 'Sam' }, { actor: 'p_owner' }));
  const sam = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'people' AND seq = 1")!.id;
  const ask = LAST_DAY();
  const withPatch = (patch: Record<string, unknown>) => ({ ...ask, body: { ...ask.body, options: [{ ...ask.body.options[0], patches: [patch] }, ask.body.options[1]] } });
  for (const p of [
    { register: 'recurring', at: 'people#1', version: 1, patch: { day_of_month: 'last' } },
    { register: 'recurring', at: sam, version: 1, patch: { day_of_month: 'last' } },
  ])
    assert.equal(refusal(k.propose(withPatch(p), 'S1')).at, 'body.options[0].patches[0].at');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')!.n, 0);
});
