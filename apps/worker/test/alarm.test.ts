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
  /* PARSED, NOT GREPPED, AND THE FORMAT MOVED UNDER IT ONCE ALREADY. This read `wrangler.toml`
     with four regexes; the config is `wrangler.jsonc` now, because two environments need a `env`
     block and TOML makes that a wall of `[env.alpha.…]` headers nobody reads. A test that
     pattern-matches a config file breaks when the file changes shape — and worse, a regex that
     stops matching reports the ASSERTION as false rather than the file as different: this one
     would have said *"declares no compatibility_date"* about a config that declares one.

     So it parses. `wrangler` itself reads JSONC, and the comments in that file are load-bearing
     enough that stripping them here — respecting string literals, which is the part a naive
     `//` strip gets wrong — is worth the twelve lines. */
  const jsonc = readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8');
  const stripped = (() => {
    let out = '';
    let inString = false;
    for (let i = 0; i < jsonc.length; i++) {
      const c = jsonc[i];
      const next = jsonc[i + 1];
      if (inString) {
        if (c === '\\') {
          out += c + (next ?? '');
          i++;
          continue;
        }
        if (c === '"') inString = false;
        out += c;
        continue;
      }
      if (c === '"') {
        inString = true;
        out += c;
        continue;
      }
      if (c === '/' && next === '/') {
        while (i < jsonc.length && jsonc[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && next === '*') {
        i += 2;
        while (i < jsonc.length && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) i++;
        i++;
        continue;
      }
      out += c;
    }
    return out.replace(/,(\s*[}\]])/g, '$1');
  })();
  const config = JSON.parse(stripped) as {
    compatibility_date?: string;
    migrations?: { new_sqlite_classes?: string[] }[];
    queues?: { producers?: { binding?: string; queue?: string }[]; consumers?: unknown[] };
    env?: Record<string, unknown>;
  };

  const date = config.compatibility_date;
  assert.ok(date, 'wrangler.jsonc declares no compatibility_date');
  assert.ok(date >= '2026-02-24', `compatibility_date is ${date}, and deleteAll() leaves the alarm behind before 2026-02-24`);

  /* ONE DATE FOR BOTH ENVIRONMENTS. A alpha deployment on a different compatibility date is not a
     rehearsal of production, it is a rehearsal of a different runtime — and the one behaviour this
     date decides is the one this test is about. */
  for (const [name, env] of Object.entries(config.env ?? {}))
    assert.equal(
      (env as { compatibility_date?: string }).compatibility_date,
      undefined,
      `env.${name} sets its own compatibility_date, so it rehearses a different runtime`,
    );

  // And both objects are SQLite-backed, which is what buys FTS5, point-in-time recovery and the
  // alarm — the Directory needs none of those and shares the class of storage anyway, because a
  // second kind of object is a second set of platform behaviours to hold in mind.
  const classes = (config.migrations ?? []).flatMap((m) => m.new_sqlite_classes ?? []);
  for (const name of ['Record$', 'Directory$']) assert.ok(classes.includes(name), `${name} is not SQLite-backed`);

  // The doorbell is a producer AND a consumer of one queue: the record rings it and the Worker
  // answers. Declaring only the producer is a queue nobody drains, which looks like a record whose
  // notifications simply never arrive.
  /* PER ENVIRONMENT, BECAUSE `queues` IS NOT INHERITABLE — and that is the trap this file exists
     next to. `durable_objects`, `queues`, `r2_buckets` and `vars` are not inherited by a named
     environment: leave one out and it is EMPTY there, not inherited, and `wrangler deploy`
     succeeds. So a top-level check would pass on a config where production rings nothing.
     `migrations` and `routes` are the opposite, which is why the ladder is top-level and there is
     deliberately no top-level `routes`. */
  const environments = Object.entries(config.env ?? {});
  assert.ok(environments.length > 0, 'no environments, so there is nothing to deploy');
  for (const [name, raw] of environments) {
    const env = raw as { queues?: { producers?: { binding?: string; queue?: string }[]; consumers?: unknown[] } };
    assert.ok(
      (env.queues?.producers ?? []).some((p) => p.binding === 'INGRESS'),
      `nothing rings the doorbell in env.${name}`,
    );
    assert.ok((env.queues?.consumers ?? []).length > 0, `nothing answers the doorbell in env.${name}`);

    /* AND THE SAME QUEUE ON BOTH SIDES. Ringing one queue and answering another is a record whose
       notifications are written, accepted, and never delivered — with nothing anywhere reporting a
       failure, because both halves are individually fine. Per environment for the same reason as
       above, and it is the check that would catch `braindog-ingress` left in `alpha` after a
       copy-paste, which is the way the two names actually diverge. */
    const rings = env.queues?.producers?.[0]?.queue;
    const answers = (env.queues?.consumers?.[0] as { queue?: string } | undefined)?.queue;
    assert.equal(rings, answers, `env.${name} rings ${rings} and answers ${answers}`);
  }
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
