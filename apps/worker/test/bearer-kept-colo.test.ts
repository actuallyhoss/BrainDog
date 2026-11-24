/**
 * The Directory's two bearer answers kept in two layers (`directoryKept`): this isolate's memory first, then the colo's
 * cache (`caches.default` on Cloudflare, a Map here), then the Directory.
 *
 * WHAT IS PINNED. A miss in memory is a hit in the colo, and the isolate keeps that answer only until the colo's entry
 * goes out, so passing an answer on never makes it older than the isolate alone let it be: 30 s for `knows`, 60 s for
 * the lapse, from when the Directory said it. `knows`'s `false` is never put and never believed. An entry past its
 * `until` is a miss even when the cache still hands it back, and one claiming more than its bound is held to it. A
 * deleted record and a lapse land within those bounds, as before, and `directoryKept.on` false asks the Directory fresh
 * without asking the colo. The key names the record and nothing of the bearer's secret, and the `bearer-time` line says
 * where each answer came from.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { LAPSED_FIX } from '../src/lapse.ts';
import { cloud, HOST } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOBODY = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const T0 = Date.UTC(2026, 10, 24, 18, 0, 0);
const KEY = new RegExp(`^https://${HOST.replace(/\./g, '\\.')}/\\.kept/directory/v1/(knows|lapsed)/rec_[0-9A-HJKMNP-TV-Z]{26}$`);

type Out = { ok: boolean; value?: any; refusal?: { code: string; fix: string; at?: string } };
type Kept = { on: boolean; colo: unknown; knownKept: Map<string, number>; lapseKept: Map<string, { until: number; lapsed: boolean }>; clear(): void };

/**
 * A colo's cache over a Map: `match` and `put` as `caches.default` takes them, counted. `age` false hands an entry back
 * past its `max-age`, as a cache that has not evicted it yet may, so the Worker's own `until` is what is tested.
 */
function coloCache(age = true) {
  const held = new Map<string, { body: string; headers: [string, string][]; out: number }>();
  const seen = { match: 0, hit: 0, put: 0 };
  return {
    held,
    seen,
    async match(key: string): Promise<Response | undefined> {
      seen.match += 1;
      const e = held.get(key);
      if (e === undefined || (age && Date.now() >= e.out)) return undefined;
      seen.hit += 1;
      return new Response(e.body, { headers: e.headers });
    },
    async put(key: string, res: Response): Promise<void> {
      seen.put += 1;
      const s = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 0);
      held.set(key, { body: await res.text(), headers: [...res.headers], out: Date.now() + s * 1000 });
    },
    /** What the entry says, or `undefined`. */
    said: (key: string) => {
      const e = held.get(key);
      return e === undefined ? undefined : (JSON.parse(e.body) as { until: number; v: boolean });
    },
  };
}

const keyOf = (what: 'knows' | 'lapsed', id: string) => `https://${HOST}/.kept/directory/v1/${what}/${id}`;

/** A record with a write key, the colo's cache set, the Directory's two methods counted, and the clock held at `T0`. */
async function kept(t: TestContext, age = true) {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  const cookie = await c.signIn(OWNER);
  const minted = (await (await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label: 'agent' }) })).json()) as Out;
  assert.ok(minted.ok, JSON.stringify(minted));
  const bearer = minted.value.bearer as string;

  const dir = c.directory as any;
  /* `billing` COUNTED ONLY WHEN IT IS ASKED THE LAPSE, so a test's own `set` is not counted as a trip. */
  const asked = { knows: 0, billing: 0 };
  for (const m of ['knows', 'billing'] as const) {
    const real = dir[m].bind(dir);
    dir[m] = (...a: unknown[]) => ((m === 'knows' || (a[0] as { op?: string })?.op === 'lapsed' ? (asked[m] += 1) : 0), real(...a));
  }
  const colo = coloCache(age);
  const k = (c.bundle as any).directoryKept as Kept;
  k.colo = colo;
  k.clear();
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  return { c, k, colo, asked, bearer, cookie, person };
}

/** The `bearer-time` lines `run` writes, every one of them: the sampling is held at "always" while it runs. */
async function lines(t: TestContext, run: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const log = console.log;
  const random = t.mock.method(Math, 'random', () => 0);
  console.log = (...a: unknown[]) => {
    const text = String(a[0]);
    if (text.startsWith('{"op":"bearer-time"')) out.push(JSON.parse(text));
    else log(...a);
  };
  try {
    await run();
  } finally {
    console.log = log;
    random.mock.restore();
  }
  return out;
}

const whoami = async (c: Awaited<ReturnType<typeof cloud>>, bearer: string, status = 200) => {
  const res = await c.ask('/api/whoami', { bearer });
  assert.equal(res.status, status, await res.clone().text());
  await res.arrayBuffer();
};

test('A MISS IN THIS ISOLATE IS A HIT IN THE COLO, AND THE ISOLATE KEEPS IT ONLY UNTIL THE COLO’S ENTRY GOES OUT', async (t) => {
  const { c, k, colo, asked, bearer } = await kept(t);
  const said = await lines(t, async () => {
    await whoami(c, bearer);
    assert.deepEqual(asked, { knows: 1, billing: 1 });
    assert.equal(colo.seen.put, 2, 'the Directory’s two answers were not put in the colo');

    /* ANOTHER ISOLATE, 20 s ON: it starts with nothing kept, and the colo answers both. */
    k.clear();
    t.mock.timers.setTime(T0 + 20_000);
    await whoami(c, bearer);
    assert.deepEqual(asked, { knows: 1, billing: 1 }, 'a cold isolate asked the Directory with the colo holding both answers');
    assert.equal(colo.seen.hit, 2);
    /* ITS MEMORY GOES OUT WITH THE COLO'S ENTRY, NOT 30 s FROM NOW: passing a yes on does not make it younger. */
    assert.equal(k.knownKept.get(REC), T0 + 30_000);
    assert.equal(k.lapseKept.get(REC)?.until, T0 + 60_000);

    /* AND AT 31 s THE YES IS OUT OF BOTH, so the Directory is asked; the lapse is in memory for another 29 s. */
    t.mock.timers.setTime(T0 + 31_000);
    await whoami(c, bearer);
    assert.deepEqual(asked, { knows: 2, billing: 1 });
  });

  /* THE KEY IS THE RECORD'S ID AND NOTHING OF THE SECRET. */
  const secret = bearer.slice(bearer.indexOf('.') + 1);
  assert.ok(secret.length > 10);
  assert.deepEqual([...colo.held.keys()].sort(), [keyOf('knows', REC), keyOf('lapsed', REC)]);
  for (const key of colo.held.keys()) {
    assert.match(key, KEY);
    assert.ok(!key.includes(secret) && !key.includes(bearer), key);
  }

  /* THE LINE SAYS WHERE EACH ANSWER CAME FROM, and the colo's time beside the Directory's. */
  assert.deepEqual(said.map((l) => [l.knowsAt, l.billingAt]), [['dir', 'dir'], ['colo', 'colo'], ['dir', 'mem']]);
  assert.ok(said.every((l) => typeof l.colo === 'number' && l.sampled === true), JSON.stringify(said));
});

test('knows’s false IS NEVER PUT IN THE COLO, AND A false FOUND THERE IS NOT BELIEVED', async (t) => {
  const { c, k, colo, asked, bearer } = await kept(t);
  /* A BEARER FOR A RECORD NOBODY HOLDS: 401 each time, the Directory asked each time, and nothing put. */
  const forged = `${NOBODY}.${'f'.repeat(43)}`;
  for (let i = 0; i < 2; i++) {
    k.clear();
    const res = await c.ask('/api/whoami', { bearer: forged });
    assert.equal(res.status, 401, await res.text());
  }
  assert.equal(asked.knows, 2);
  assert.equal(colo.seen.put, 0, 'a no was put in the colo');
  assert.equal(colo.held.has(keyOf('knows', NOBODY)), false);
  assert.equal(k.knownKept.has(NOBODY), false);

  /* A no FOUND IN THE COLO, as nothing here writes, is a miss: the Directory is asked and its yes replaces it. */
  colo.held.set(keyOf('knows', REC), { body: JSON.stringify({ until: T0 + 30_000, v: false }), headers: [], out: T0 + 30_000 });
  await whoami(c, bearer);
  assert.equal(asked.knows, 3);
  assert.deepEqual(colo.said(keyOf('knows', REC)), { until: T0 + 30_000, v: true });
});

test('AN ENTRY PAST ITS until IS A MISS WHEN THE CACHE STILL HANDS IT BACK, AND ONE CLAIMING MORE IS HELD TO ITS BOUND', async (t) => {
  const { c, k, colo, asked, bearer } = await kept(t, false);
  await whoami(c, bearer);
  assert.deepEqual(asked, { knows: 1, billing: 1 });

  /* 31 s ON, A COLD ISOLATE: the yes is handed back and is out, so the Directory is asked; the lapse is still in. */
  t.mock.timers.setTime(T0 + 31_000);
  k.clear();
  await whoami(c, bearer);
  assert.deepEqual(asked, { knows: 2, billing: 1 });
  assert.equal(colo.seen.hit, 2, 'the cache did not hand both entries back');

  /* 61 s ON: the lapse is out too, and so is the yes the Directory gave at 31 s. */
  t.mock.timers.setTime(T0 + 61_000);
  k.clear();
  await whoami(c, bearer);
  assert.deepEqual(asked, { knows: 3, billing: 2 });

  /* AN ENTRY THAT SAYS IT IS IN FOR TEN MINUTES IS KEPT 30 s AND 60 s FROM NOW, NO LONGER. */
  const now = T0 + 70_000;
  t.mock.timers.setTime(now);
  colo.held.set(keyOf('knows', REC), { body: JSON.stringify({ until: now + 600_000, v: true }), headers: [], out: now + 600_000 });
  colo.held.set(keyOf('lapsed', REC), { body: JSON.stringify({ until: now + 600_000, v: false }), headers: [], out: now + 600_000 });
  k.clear();
  await whoami(c, bearer);
  assert.deepEqual(asked, { knows: 3, billing: 2 });
  assert.equal(k.knownKept.get(REC), now + 30_000);
  assert.equal(k.lapseKept.get(REC)?.until, now + 60_000);

  /* AND AN ENTRY OF ANOTHER SHAPE IS A MISS. */
  colo.held.set(keyOf('knows', REC), { body: 'not json', headers: [], out: now + 600_000 });
  colo.held.set(keyOf('lapsed', REC), { body: JSON.stringify({ until: now + 30_000, v: 'no' }), headers: [], out: now + 600_000 });
  k.clear();
  await whoami(c, bearer);
  assert.deepEqual(asked, { knows: 4, billing: 3 });
});

test('A LAPSE LANDS IN EVERY ISOLATE WITHIN THE MINUTE IT HAD, AND directoryKept.on FALSE ASKS IT FRESH WITHOUT THE COLO', async (t) => {
  const { c, k, colo, asked, bearer, person } = await kept(t);
  /* A WRITE THE RECORD ANSWERS, here that it has no such register, is one the lapse let through; a lapse is a 403. */
  const write = (title: string) => c.ask('/api/create', { method: 'POST', bearer, body: JSON.stringify({ register: 'tasks', fields: { title } }) });
  const through = async (title: string) => {
    const res = await write(title);
    const out = (await res.json()) as Out;
    assert.equal(res.status, 422, JSON.stringify(out));
    assert.equal(out.refusal?.code, 'REGISTER_UNKNOWN', JSON.stringify(out));
  };
  await through('Paid for');
  assert.deepEqual(colo.said(keyOf('lapsed', REC)), { until: T0 + 60_000, v: false });

  /* THE LAPSE, AS A VERIFIED STRIPE EVENT LEAVES IT. */
  const set = (c.directory as any).billing({ op: 'set', row: { record: REC, person, customer: 'cus_1', state: 'lapsed' } }) as Out;
  assert.ok(set.ok, JSON.stringify(set));

  /* A COLD ISOLATE 40 s ON STILL READS THE COLO'S no, the bound the isolate alone had... */
  t.mock.timers.setTime(T0 + 40_000);
  k.clear();
  await through('Inside the minute');
  assert.equal(asked.billing, 1);

  /* ...AND 61 s ON, ANY ISOLATE, WARM OR COLD, IS REFUSED. */
  t.mock.timers.setTime(T0 + 61_000);
  const warm = await write('After the minute');
  assert.equal(warm.status, 403);
  assert.deepEqual(((await warm.json()) as Out).refusal, { code: 'FORBIDDEN', fix: LAPSED_FIX, at: 'billing' });
  k.clear();
  assert.equal((await write('After the minute, cold')).status, 403);
  assert.equal(asked.billing, 2, 'the cold isolate asked the Directory with the colo holding the lapse');

  /* PAID AGAIN, AND THE SWITCH OFF: the Directory is asked at once and the colo is neither read nor written. */
  const paid = (c.directory as any).billing({ op: 'set', row: { record: REC, person, customer: 'cus_1', state: 'active' } }) as Out;
  assert.ok(paid.ok, JSON.stringify(paid));
  const before = { ...colo.seen };
  k.on = false;
  try {
    await through('Paid again');
  } finally {
    k.on = true;
  }
  assert.deepEqual(colo.seen, before, 'the switch off still asked the colo');
  assert.equal(asked.billing, 3);
  assert.deepEqual(colo.said(keyOf('lapsed', REC)), { until: T0 + 61_000 + 60_000, v: true }, 'the switch off wrote the colo');
});

test('A DELETED RECORD’S BEARER IS 401 WHILE THE COLO STILL SAYS YES, AND THE COLO STOPS SAYING IT WITHIN 30 s', async (t) => {
  const { c, k, colo, asked, bearer, cookie } = await kept(t);
  await whoami(c, bearer);
  const gone = await c.ask('/api/deleteRecord', { method: 'POST', cookie, body: JSON.stringify({ slug: SLUG }) });
  assert.equal(gone.status, 200, await gone.clone().text());
  assert.equal(await (c.directory as any).knows(REC), false, 'the delete left the name open');
  asked.knows -= 1;

  const object = c.record(REC) as any;
  const seen = { admit: 0, fetch: 0 };
  const admit = object.admit.bind(object);
  object.admit = (...a: unknown[]) => ((seen.admit += 1), admit(...a));
  const fetch = object.fetch.bind(object);
  object.fetch = (request: Request) => ((seen.fetch += 1), fetch(request));

  /* A COLD ISOLATE 10 s ON: the colo's yes reaches the object, which refuses it, so it is the one 401 and no forward. */
  t.mock.timers.setTime(T0 + 10_000);
  k.clear();
  await whoami(c, bearer, 401);
  assert.equal(asked.knows, 1);
  assert.deepEqual(seen, { admit: 1, fetch: 0 });

  /* 31 s ON: the yes is out of both layers, the Directory says no, and nothing is put or asked of the object. */
  t.mock.timers.setTime(T0 + 31_000);
  const puts = colo.seen.put;
  await whoami(c, bearer, 401);
  k.clear();
  await whoami(c, bearer, 401);
  assert.equal(asked.knows, 3);
  assert.deepEqual(seen, { admit: 1, fetch: 0 }, 'the object was asked after the Directory said no');
  assert.equal(colo.seen.put, puts, 'a no was put in the colo');
});
