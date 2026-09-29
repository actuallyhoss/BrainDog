/**
 * `rehearse`, the first kernel extension (`api/rehearse.ts`).
 *
 * TWO THINGS ARE PROVED HERE, AND THE FIRST IS THE MECHANISM. `rehearse` is written under `api/` and reaches the kernel
 * only through `extensions(parts)` and the spread in `makeKernel`, so `k.rehearse` being callable at all is the proof
 * that an extension file lands on the record without a line of `index.ts` naming it.
 *
 * THE SECOND IS THE PROMISE THE PREVIEWS REST ON: the real write path runs, its answer comes back, and nothing it wrote
 * is left behind, the list cache included.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { openRecord, type Declaration } from '../index.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const PERSON = { actor: 'p_1' };

const REGISTER = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
});

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([REGISTER('notes')])).ok);
  const events = () => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n ?? 0;
  return { k, sql, events };
}

test('A ROW WRITTEN IN A REHEARSAL IS ANSWERED AND THEN GONE, with its events and its number', async () => {
  const { k, events } = await record();
  const before = events();

  const written = k.rehearse(() => value(k.create('notes', { what: 'Kiln' }, PERSON)));
  assert.equal(written.seq, 1);
  assert.equal(written.fields.what, 'Kiln');

  assert.equal(k.count('notes'), 0, 'the rehearsed row is still in the list');
  assert.equal(events(), before, 'the rehearsed write left an event');
  /* THE COUNTER ROLLED BACK TOO, so the first real row takes the number the rehearsal was shown. */
  assert.equal(value(k.create('notes', { what: 'Kiln' }, PERSON)).seq, 1);
});

test('A LIST INSTALLED IN A REHEARSAL IS SEEN INSIDE IT, AND THE CACHE FORGETS IT AFTER', async () => {
  const { k, sql } = await record();
  const staged = await k.stageInstall([REGISTER('jobs')]);
  assert.ok(staged.ok, JSON.stringify(staged));
  const write = (staged as { ok: true; value: () => Result<unknown> }).value;

  const inside = k.rehearse(() => {
    value(write());
    k.reload();
    return { name: k.register('jobs')?.name ?? null, row: value(k.create('jobs', { what: 'Glaze' }, PERSON)).seq };
  });
  assert.deepEqual(inside, { name: 'jobs', row: 1 });

  assert.equal(k.register('jobs'), undefined, 'the list cache still holds the rehearsed list');
  assert.equal(sql.one("SELECT 1 AS x FROM declaration WHERE id = 'register.jobs'"), undefined);
  const refused = k.create('jobs', { what: 'Glaze' }, PERSON);
  assert.equal(refused.ok, false);
  assert.equal((refused as { refusal: { code: string } }).refusal.code, 'REGISTER_UNKNOWN');
});

test('A REHEARSAL INSIDE A WRITE IS REFUSED BEFORE ANYTHING RUNS, and the write around it is untouched', async () => {
  const { k } = await record();
  let ran = false;
  assert.throws(
    () =>
      k.transaction(() => {
        value(k.create('notes', { what: 'Kept' }, PERSON));
        return k.rehearse(() => {
          ran = true;
          return 1;
        });
      }),
    { name: 'TypeError', message: 'rehearse inside a write' },
  );
  assert.equal(ran, false);
  /* THE THROW ROLLED THE OUTER WRITE BACK, WHICH IS THE CALLER'S TRANSACTION DOING ITS JOB: nothing was committed half. */
  assert.equal(k.count('notes'), 0);
  /* AND THE KERNEL IS NOT LEFT THINKING IT IS INSIDE ONE. */
  assert.equal(k.rehearse(() => 2), 2);
});

test('A THROW IN A REHEARSAL GOES TO THE CALLER, AND WHAT RAN BEFORE IT IS ROLLED BACK', async () => {
  const { k, events } = await record();
  const before = events();
  assert.throws(
    () =>
      k.rehearse(() => {
        value(k.create('notes', { what: 'Half' }, PERSON));
        throw new RangeError('stopped halfway');
      }),
    { name: 'RangeError', message: 'stopped halfway' },
  );
  assert.equal(k.count('notes'), 0);
  assert.equal(events(), before);
});

test('A FUNCTION THAT RETURNS A PROMISE IS REFUSED, because its rest would run after the rollback', async () => {
  const { k } = await record();
  assert.throws(() => k.rehearse(() => Promise.resolve(1)), TypeError);
  assert.equal(k.rehearse(() => 'after'), 'after');
});
