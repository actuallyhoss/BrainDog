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
import { recordOf, servesApi } from '../src/route.ts';

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

test('THE BEARER NAMES THE RECORD, and the string it names is the tenant boundary', () => {
  /* The id this returns is the argument to `idFromName`, and `idFromName` on a name nobody has
     CREATES the object rather than failing — so what is NOT a record id matters more than what is.
     The secret half is never looked at here: whether the bearer is real is the record's question,
     asked against its own table, and asking it anywhere else would be a search across every
     customer. */
  const id = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
  assert.equal(recordOf(`Bearer ${id}.s3cret`), id);
  assert.equal(recordOf(`bearer ${id}.s3cret`), id, 'the scheme is case-insensitive');
  assert.equal(recordOf(`Bearer   ${id}.a.b.c`), id, 'the secret may contain the separator');

  for (const bad of [
    null,
    '',
    'Bearer',
    'Bearer ',
    `Basic ${id}.s3cret`,
    `Bearer ${id}`,
    `Bearer .s3cret`,
    `Bearer ${id.toLowerCase()}.s3cret`,
    'Bearer rec_01JZ8QK3F7R2M9V4XN6TCB5HA.s3cret',
    'Bearer rec_01JZ8QK3F7R2M9V4XN6TCB5HADX.s3cret',
    'Bearer rec_01IZ8QK3F7R2M9V4XN6TCB5HAD.s3cret',
    `Bearer ${id}/../other.s3cret`,
    'Bearer directory.s3cret',
  ])
    assert.equal(recordOf(bad), null, `${bad} resolved to a record`);

  /* `directory` IS THE ONE NAME THAT WOULD NOT BE A NEW OBJECT. It is the installation's tenant map,
     addressed by `idFromName('directory')` — and it is a different class, so reaching it through
     `RECORD` would not even be the same storage. The grammar refuses it anyway, which is the point:
     the check is a shape rather than a list of names somebody remembered. */
});

test('AND THE WORKER ANSWERS FOR /api AND NOTHING ELSE', () => {
  /* `/r/<slug>` was the tenant prefix here, and `/r/<register>` is the app's own register list
     (19 §2), the target of every `{{ref:}}` link (36) and a real SvelteKit route. Put the Worker in
     front of the assets as 33 §4's `run_worker_first` describes and every register link in the
     product answered "There is no record called obligations." */
  for (const path of ['/api/list', '/api/boot', '//api//list', '/api/create'])
    assert.equal(servesApi(path), true, `${path} is not served`);

  for (const path of ['/', '/api', '/api/', '/apix/list', '/r/obligations', '/r/obligations/7', '/mcp', '/a/abc', '/s/tok'])
    assert.equal(servesApi(path), false, `${path} was claimed`);

  /* A percent-encoded traversal arrives DECODED AND RESOLVED by `new URL`, so it is the api prefix
     by the time this sees it — which is safe, and is why the method is resolved by a table lookup
     rather than by reading the rest of the path as a name. */
  assert.equal(new URL('https://x/%2e%2e/api/list').pathname, '/api/list');
  assert.equal(servesApi(new URL('https://x/api/%2e%2e/%2e%2e/etc').pathname), false, 'a traversal walked out of /api');
});
