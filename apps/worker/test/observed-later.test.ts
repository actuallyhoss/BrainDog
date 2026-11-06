/**
 * A read's counters wait and go together, and every reader of the tables still sees every count (`observed-later.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OBSERVE_COUNT, OBSERVE_COUNT_WHO, observe } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { OBSERVED_LATER_MS, observedLater } from '../src/observed-later.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW';
const OWNER = 'ada@example.test';

/** A pretend `Sql` that writes down what reached it. */
function fake() {
  const sent: { text: string; params: unknown[] }[] = [];
  const sql: Sql = {
    exec: (text, ...params) => void sent.push({ text, params }),
    all: (text, ...params) => (sent.push({ text, params }), []),
    one: (text, ...params) => void sent.push({ text, params }),
    transactionSync: (fn) => fn(),
  };
  return { sql, sent };
}

function later(live?: () => boolean) {
  const inner = fake();
  let waits = 0;
  let due: (() => void) | null = null;
  const o = observedLater(
    inner.sql,
    (flush) => {
      waits += 1;
      due = flush;
    },
    live,
  );
  return { ...inner, o, waits: () => waits, fire: () => due?.() };
}

test('COUNTS REACH NOTHING UNTIL THE WAIT IS OVER, and then as one count each, added up', () => {
  const { o, sent, waits, fire } = later();
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'notes', '2026-11-06');
  o.sql.exec(OBSERVE_COUNT_WHO, 'page.render', 'home', '2026-11-06', 'p_1');
  o.sql.exec(OBSERVE_COUNT_WHO, 'page.render', 'home', '2026-11-06', 'p_1');
  assert.equal(sent.length, 0);
  assert.equal(waits(), 1, 'one wait for the lot');
  fire();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0]!.params, ['register.read', 'tasks', '2026-11-06', 2]);
  assert.deepEqual(sent[1]!.params, ['register.read', 'notes', '2026-11-06', 1]);
  assert.deepEqual(sent[2]!.params, ['page.render', 'home', '2026-11-06', 'p_1', 2]);
  assert.match(sent[0]!.text, /n = n \+ excluded\.n/u);
  assert.equal(o.held(), 0);
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
  assert.equal(waits(), 2, 'a count after the flush waits again');
});

test('ANYTHING THAT NAMES THE TABLES GETS THE COUNTS FIRST, a read, a purge or an erasure, and nothing else does', () => {
  for (const [how, text] of [
    ['all', 'SELECT subject, sum(n) FROM observation GROUP BY 1'],
    ['one', 'SELECT count(*) FROM OBSERVATION_WHO'],
    ['exec', 'DELETE FROM observation_who WHERE who = ?'],
  ] as const) {
    const { o, sent } = later();
    o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
    o.sql[how](text);
    assert.equal(sent.length, 2, how);
    assert.match(sent[0]!.text, /^INSERT INTO observation /u);
    assert.equal(sent[1]!.text, text);
  }
  const { o, sent } = later();
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
  o.sql.all('SELECT id FROM entry');
  assert.equal(sent.length, 1, 'a read of something else wrote the counts');
  assert.equal(o.held(), 1);
});

test('NOTHING IS WRITTEN ONCE THE RECORD IS GONE OR A RESTORE IS ARMED', () => {
  let live = true;
  const { o, sent, fire } = later(() => live);
  o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
  live = false;
  fire();
  assert.equal(sent.length, 0);
  assert.equal(o.held(), 0);
});

test('A FAULT IN THE WRITE STOPS NOTHING: it is said, and the counts are let go', () => {
  const inner = fake();
  const o = observedLater({ ...inner.sql, exec: () => { throw new Error('storage'); } }, () => undefined);
  const said: unknown[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void said.push(a);
  try {
    o.sql.exec(OBSERVE_COUNT, 'register.read', 'tasks', '2026-11-06');
    assert.doesNotThrow(() => o.flush());
  } finally {
    console.error = error;
  }
  assert.equal(said.length, 1);
  assert.equal(o.held(), 0);
});

test('THE KERNEL WRITES EXACTLY THE STATEMENTS THIS HOLDS BACK', () => {
  const { o, sent } = later();
  const out = observe(o.sql, Date.UTC(2026, 10, 6), [{ kind: 'page.render', subject: 'home', who: 'p_1' }]);
  assert.ok(out.ok);
  assert.equal(sent.length, 0, 'the kernel wrote a counter past this');
  assert.equal(o.held(), 2);
});

test('THROUGH THE OBJECT: a read writes no counter, the count is there when something reads it, and it holds across reads', async () => {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  await c.settle();
  const storage = c.storages.get(REC)!;
  const count = () => Number((storage.sql.exec("SELECT coalesce(sum(n), 0) AS n FROM observation WHERE kind = 'register.read' AND subject = 'session'").toArray()[0] as { n: number }).n);
  const list = async () => {
    const res = await c.ask('/api/list?register=session&limit=1', { cookie });
    assert.equal(res.status, 200);
    await res.text();
  };
  const before = count();
  await list();
  await list();
  assert.equal(count(), before, 'a read wrote its counter on the way');
  /* The alarm writes down what it finds held, as the wait would. */
  await (c.record(REC) as unknown as { alarm(): Promise<void> }).alarm();
  assert.equal(count(), before + 2, 'a count was lost');
});

test('THE WAIT IS SECONDS AND NOT MINUTES', () => {
  assert.ok(OBSERVED_LATER_MS >= 1_000 && OBSERVED_LATER_MS <= 60_000);
});
