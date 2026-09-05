/**
 * The hosted record's alarm.
 *
 * A Durable Object cannot be started in a bare Node process, and the useful half does not need one:
 * the platform's contribution is three methods on `ctx.storage`, and everything that can be wrong is
 * in the twenty lines above them. What is asserted here is the invariant — one alarm per customer,
 * always the earliest pending row or nothing — and the two behaviours nobody notices until a
 * customer's reminders have been silent for a fortnight.
 *
 * The compatibility date is checked here too, because `09-ALARMS` §1 says in as many words that a
 * prose rule which survives the behaviour it describes is how a codebase accumulates rituals nobody
 * can explain. `deleteAll()` clears the alarm at 2026-02-24 and later; below it, it does not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { alarmScheduler, type AlarmStore } from '../src/alarm.ts';
import { recordPath } from '../src/route.ts';

/** The three methods, and a log of what was actually asked of the platform. */
function fakeStore(at: number | null = null) {
  const calls: string[] = [];
  const store: AlarmStore & { calls: string[]; at: number | null } = {
    calls,
    get at() {
      return at;
    },
    getAlarm: () => (calls.push('get'), Promise.resolve(at)),
    setAlarm: (t) => {
      calls.push(`set:${t instanceof Date ? t.getTime() : t}`);
      at = t instanceof Date ? t.getTime() : t;
      return Promise.resolve();
    },
    deleteAlarm: () => (calls.push('delete'), (at = null), Promise.resolve()),
  };
  return store;
}

test('THE ALARM IS SET TO THE EARLIEST PENDING ROW, and setting it twice sets it once', async () => {
  // `arm()` runs after every write that could have moved the minimum, which on a busy record is
  // every write. Reading first turns "set the alarm" into a read that usually decides to do nothing.
  const store = fakeStore();
  const s = alarmScheduler(store);

  await s.set(1_000);
  assert.equal(store.at, 1_000);

  store.calls.length = 0;
  await s.set(1_000);
  assert.deepEqual(store.calls, ['get'], 'the alarm was re-set to the time it already held');

  await s.set(500);
  assert.equal(store.at, 500, 'an earlier row did not move the alarm forward');
});

test('AN ALARM ALREADY PAST IS SET, NOT SKIPPED', async () => {
  // The failure: a record reopened after a week, whose reminders came due while nothing was
  // running. Skipping a past time means the schedule never restarts — it waits for a write that may
  // never come, and every reminder after it waits too.
  const store = fakeStore();
  const s = alarmScheduler(store);
  await s.set(Date.now() - 86_400_000);
  assert.ok(store.at !== null, 'a reminder whose time already came armed nothing');
});

test('and clearing an alarm that is not set asks the platform for nothing', async () => {
  const empty = alarmScheduler(fakeStore());
  const store = fakeStore();
  await empty.clear();

  const s = alarmScheduler(store);
  await s.set(1_000);
  store.calls.length = 0;
  await s.clear();
  assert.deepEqual(store.calls, ['get', 'delete']);
  assert.equal(store.at, null);

  store.calls.length = 0;
  await s.clear();
  assert.deepEqual(store.calls, ['get'], 'an alarm that was not set was deleted anyway');
});

test('the doorbell is optional, and ringing a bell nobody hung is not an error', async () => {
  // Until a queue binding exists, `wake()` has nothing to send. The honest shape of that is a
  // scheduler that accepts no doorbell rather than one that silently drops a message.
  await alarmScheduler(fakeStore()).wake();

  const rung: number[] = [];
  const s = alarmScheduler(fakeStore(), () => (rung.push(1), Promise.resolve()));
  await s.wake();
  assert.deepEqual(rung, [1]);
});

test('THE COMPATIBILITY DATE IS AN ASSERTION, not a sentence in a document', () => {
  /* `deleteAll()` also deletes an active alarm for compatibility dates of 2026-02-24 or later; below
     it, the alarm outlives the storage and fires against a record that no longer exists. The extra
     `deleteAlarm()` in the delete runbook is belt and braces at a current date — which is only true
     while the date IS current, and a document cannot check that. */
  const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
  const date = /^compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/m.exec(toml)?.[1];
  assert.ok(date, 'wrangler.toml declares no compatibility_date');
  assert.ok(date && date >= '2026-02-24', `compatibility_date is ${date}, and deleteAll() leaves the alarm behind before 2026-02-24`);

  // And both objects are SQLite-backed, which is what buys FTS5, point-in-time recovery and the
  // alarm — the Directory needs none of those and shares the class of storage anyway, because a
  // second kind of object is a second set of platform behaviours to hold in mind.
  const classes = /new_sqlite_classes\s*=\s*\[([^\]]*)\]/.exec(toml)?.[1] ?? '';
  for (const name of ['Record$', 'Directory$'])
    assert.ok(classes.includes(`"${name}"`), `${name} is not SQLite-backed`);

  // The doorbell is a producer AND a consumer of one queue: the record rings it and the Worker
  // answers. Declaring only the producer is a queue nobody drains, which looks like a record whose
  // notifications simply never arrive.
  assert.match(toml, /\[\[queues\.producers\]\][\s\S]*binding = "INGRESS"/, 'nothing rings the doorbell');
  assert.match(toml, /\[\[queues\.consumers\]\]/, 'nothing answers the doorbell');
  const producer = /\[\[queues\.producers\]\][^[]*?queue = "([^"]+)"/.exec(toml)?.[1];
  const consumer = /\[\[queues\.consumers\]\][^[]*?queue = "([^"]+)"/.exec(toml)?.[1];
  assert.equal(producer, consumer, 'the doorbell rings one queue and is answered on another');
});

/* ── the router ────────────────────────────────────────────────── */

test('THE SLUG IN THE PATH IS THE TENANT BOUNDARY, and it is a grammar rather than a trim', () => {
  // The string this returns is the argument to `idFromName`. A path that resolves to the wrong slug
  // is one customer reading another's record, so what is NOT a slug matters more than what is.
  assert.deepEqual(recordPath('/r/the-studio/api/list'), { slug: 'the-studio', rest: '/api/list' });
  assert.deepEqual(recordPath('/r/kiln'), { slug: 'kiln', rest: '/' });
  assert.deepEqual(recordPath('/r/kiln/'), { slug: 'kiln', rest: '/' }, 'a trailing slash made a different path');

  for (const bad of ['/', '/r', '/r/', '/api/list', '/R/kiln/api/list', '/x/kiln/api/list'])
    assert.equal(recordPath(bad), null, `${bad} resolved to a record`);

  // And the shapes somebody reaches for when they are looking for a way out of the prefix.
  for (const bad of ['/r/../api/list', '/r/.well-known/x', '/r/Kiln/api/list', '/r/-kiln/api/list', '/r/kiln-/api/list', '/r/a_b/api/list'])
    assert.equal(recordPath(bad), null, `${bad} resolved to a record`);

  // A percent-encoded traversal arrives decoded by `new URL`, so the grammar is what refuses it.
  assert.equal(recordPath(new URL('https://x/r/%2e%2e/api/list').pathname), null);
  assert.equal(recordPath(new URL('https://x/r/kiln/api/list?q=1').pathname)?.rest, '/api/list');
});
