/**
 * `GET /healthz` on the Cloud Worker: a liveness answer that asks nothing of anybody.
 *
 * MEASURED AT afb3b1b2, BEFORE THIS FILE: the bundle answered `GET /healthz` with 404 `ROUTE_UNKNOWN`, "A record method
 * is at /api/<method>.", which is the router's answer for a path it does not know. An uptime check pointed at it read
 * the Worker as down on every probe. `/.well-known/braindog-build` answers the build and was the nearest thing, but it
 * is a gate's question about which deploy is live, and a monitor that follows the convention asks `/healthz`.
 *
 * AND AT 07ba6dbd IT ANSWERED `{ ok: true, app }` AND NOTHING ELSE, where `53 §13 #9` asks for `format`, `kernel` and
 * `primitives` too. The three are constants of the build, the numbers every record's `/api/version` answers, so they
 * need no record; each is compared here with the module that owns it, `primitives` with the renderer's own, because the
 * Worker holds a copy of that one (`src/health.ts` says why).
 *
 * NO RECORD AND NO CREDENTIAL. A liveness probe that woke a record would be a probe that costs a storage read every
 * minute and fails when one record is sick, which is not the question it asks. The env here throws on every binding a
 * record would need, so a route that reached for one fails the test by name.
 *
 * AND THE DIRECTORY ONCE, FOR THE NIGHT (LCH-C01). Before it, `/healthz` could not say whether last night's copies were
 * taken, and a night that did not run reached nobody. The Directory here answers `night()` alone; a HEAD never asks, and a
 * Directory that throws is `night: null` beside a 200.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';

import { PRIMITIVES_VERSION } from '../../../packages/render/src/kinds.ts';
import { SIGNUP_STOPPED, launchState } from '../src/launch.ts';
import { bundled } from './bundled-worker.ts';

/* `53 §13 #9`'s TUPLE, EACH FROM THE MODULE THAT OWNS IT, so a build that moved one and not this door goes red here. */
const TUPLE = { format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: PRIMITIVES_VERSION };

const touched: string[] = [];
const trap = (name: string) =>
  new Proxy({}, { get: (_, key) => { touched.push(`${name}.${String(key)}`); throw new Error(`${name} was reached for /healthz`); } });

/* PRODUCTION'S SHAPE ON 8 OCTOBER: open, no bot check keyed, billing off (DIRECTION §42), and what `signUp()` needs
   before the switch is asked: a 32-character session key, the public address, a sending address and the mail binding. */
const LAUNCH_ENV = {
  SIGNUP: 'open',
  BILLING: '',
  SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789',
  PUBLIC_HOST: 'brain.example.test',
  AUTH_MAIL_FROM: 'hello@brain.example.test',
  EMAIL: { send: async () => {} },
};
const LAUNCH = launchState(LAUNCH_ENV);

/* THE DIRECTORY'S ONE METHOD THIS DOOR MAY CALL, answering whatever the test last told it, and every other key a trap. */
let kept: unknown = null;
let asked = 0;
const directory = {
  idFromName: (name: string) => name,
  get: () =>
    new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === 'night') return async () => (asked++, kept instanceof Error ? Promise.reject(kept) : kept);
          if (key === 'then') return undefined;
          touched.push(`DIRECTORY.${String(key)}`);
          throw new Error(`the Directory's ${String(key)} was reached for /healthz`);
        },
      },
    ),
};

async function ask(path: string, init: RequestInit & { host?: string; build?: string; vars?: Record<string, unknown> } = {}) {
  const { default: worker } = await bundled();
  const env = {
    LEGACY_HOSTS: 'app.brain.example.test',
    ...LAUNCH_ENV,
    ...init.vars,
    BRAINDOG_BUILD: init.build ?? '2026.09.23+abc1234',
    RECORD: trap('RECORD'),
    DIRECTORY: directory,
    INGRESS: trap('INGRESS'),
    ASSETS: trap('ASSETS'),
  };
  return worker.fetch(new Request(`https://${init.host ?? 'brain.example.test'}${path}`, init), env, { waitUntil: () => {} });
}

test('GET /healthz IS 200 WITH THE TUPLE OF 53 §13 #9, `ok` BESIDE IT, with no-store, and touches no object', async () => {
  touched.length = 0;
  const out = await ask('/healthz');
  assert.equal(out.status, 200, await out.clone().text());
  assert.deepEqual(await out.json(), { ok: true, app: '2026.09.23+abc1234', ...TUPLE, launch: LAUNCH, night: null });
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.match(out.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(touched, [], 'a binding was reached for a liveness probe');
});

test('AN UNSET BUILD IS null, as `/.well-known/braindog-build` says it', async () => {
  assert.deepEqual(await (await ask('/healthz', { build: '' })).json(), { ok: true, app: null, ...TUPLE, launch: LAUNCH, night: null });
});

test('HEAD ANSWERS HEAD: the same status and headers, and no body, and asks the Directory nothing', async () => {
  touched.length = 0;
  asked = 0;
  const out = await ask('/healthz', { method: 'HEAD' });
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.equal(await out.text(), '');
  assert.deepEqual(touched, []);
  assert.equal(asked, 0);
});

test('ANY OTHER METHOD IS 405 WITH Allow, and the path is exactly /healthz', async () => {
  const posted = await ask('/healthz', { method: 'POST', body: '{}' });
  assert.equal(posted.status, 405);
  assert.equal(posted.headers.get('allow'), 'GET, HEAD');
  /* A trailing slash is the same path, as every other door here reads it; a longer path is not this door. */
  assert.equal((await ask('/healthz/')).status, 200);
  assert.notEqual((await ask('/healthz/x')).status, 200);
});

test('A BROWSER ON THE OLD HOST IS ANSWERED WHERE IT STANDS, not sent to /app/healthz', async () => {
  /* `legacyRedirect` sends every page load on a legacy host to `https://<PUBLIC_HOST>/app<path>`. A monitor that sends
     `accept: text/html` would follow a 308 to the app shell and read a 200 from the wrong thing. */
  const out = await ask('/healthz', { host: 'app.brain.example.test', headers: { accept: 'text/html' } });
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { ok: true, app: '2026.09.23+abc1234', ...TUPLE, launch: LAUNCH, night: null });
});

test('HEALTH CARRIES THE LAUNCH: open, no bot check, and nothing more for a stranger', async () => {
  const out = (await (await ask('/healthz')).json()) as { launch: { signup: string; botCheck: boolean; billing: string; why: string[] } };
  assert.equal(out.launch.signup, 'open');
  assert.equal(out.launch.botCheck, false);
  assert.equal(out.launch.billing, 'off');
  assert.deepEqual(out.launch.why, [], "an open door that works tells a stranger nothing more; the strike limit is the owner's (launchDetail)");
  /* ONLY WHETHER THE SECRET IS SET IS READ: its value never reaches the answer. */
  const keyed = await ask('/healthz', { vars: { TURNSTILE_SECRET: '0x-a-secret-value', TURNSTILE_SITE_KEY: '0x-site' } });
  const text = await keyed.text();
  assert.ok(!text.includes('0x-a-secret-value'), 'the secret was answered');
  assert.equal((JSON.parse(text) as { launch: { botCheck: boolean } }).launch.botCheck, true);
});

/* AUDIT 34, FINDING 2: the answer said `open` while `signUp()` refused everybody or sent no letter. Each thing it needs,
   taken away alone through the bundle's own env, is `closed` here with its sentence, and the switch still says open. */
const STOPPED: [string, unknown, RegExp][] = [
  ['SESSION_SECRET', 'only-thirty-one-characters-long', /session key is missing or shorter than 32 characters/],
  ['PUBLIC_HOST', '', /no public address set/],
  ['AUTH_MAIL_FROM', '', /No address to send mail from/],
  ['EMAIL', undefined, /Mail is not connected/],
];

for (const [key, value, sentence] of STOPPED)
  test(`WITHOUT ${key}, /healthz SAYS SIGN-UP IS closed, IN ONE SENTENCE`, async () => {
    const out = (await (await ask('/healthz', { vars: { [key]: value } })).json()) as { ok: boolean; launch: { signup: string; why: string[] } };
    assert.equal(out.ok, true, 'a sign-up that cannot work is a fact beside the liveness, never a failed probe');
    assert.equal(out.launch.signup, 'closed', out.launch.why.join(' | '));
    assert.deepEqual(out.launch.why, [SIGNUP_STOPPED], out.launch.why.join(' | '));
    assert.ok(!out.launch.why.some((w) => sentence.test(w)), "which setting is missing is the owner's, not a stranger's");
    assert.ok(!out.launch.why.some((w) => w.startsWith('The bot check is not keyed')), 'a closed door needs no limit sentence');
  });

test("HEALTH CARRIES LAST NIGHT, from one Directory call: what failed, and `ran` only when it is fresh and whole", async () => {
  const at = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const whole = { at, records: 12, backups: 12, backups_failed: 0, directory: 'ok', expiry_failed: 0, stragglers: 0, erase_open: 0, counts_written: true };
  kept = whole;
  touched.length = 0;
  asked = 0;
  const said = (await (await ask('/healthz')).json()) as { night: Record<string, unknown> };
  /* NO COUNT OF RECORDS OR COPIES: on a whole night either is how many people have a record here. `reached` says the walk
     found some, and the number stays in the Directory. */
  assert.deepEqual(said.night, { at, reached: true, backups_failed: 0, expiry_failed: 0, stragglers: 0, erase_open: 0, counts_written: true, directory: 'ok', ran: true });
  assert.equal(asked, 1, 'one Directory call a probe');
  assert.deepEqual(touched, []);

  /* A FAILED COPY, A DIRECTORY NOT COPIED, OR A NIGHT OLDER THAN 26 HOURS IS A NIGHT THAT DID NOT RUN WHOLE; the rest of
     the cases are `night-ran.test.ts`'s. */
  const ran = async () => ((await (await ask('/healthz')).json()) as { night: { ran: boolean } }).night.ran;
  kept = { ...whole, backups: 11, backups_failed: 1 };
  assert.equal(await ran(), false);
  kept = { ...whole, directory: 'failed' };
  assert.equal(await ran(), false);
  kept = { ...whole, records: 0, backups: 0 };
  assert.equal(await ran(), false, 'a walk that reached nobody did not copy everybody');
  kept = { ...whole, expiry_failed: 1 };
  assert.equal(await ran(), false);
  kept = { ...whole, at: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString() };
  const late = await ask('/healthz');
  assert.equal(late.status, 200, 'a late night is a fact beside the liveness, never a failed probe');
  const lateSaid = (await late.json()) as { ok: boolean; night: { ran: boolean } };
  assert.deepEqual([lateSaid.ok, lateSaid.night.ran], [true, false]);

  /* A DIRECTORY THAT NEVER ANSWERS IS `null` TOO, after a short wait, so the probe is not held on it. */
  kept = new Promise(() => {});
  const started = Date.now();
  const hung = await ask('/healthz');
  assert.equal(hung.status, 200);
  assert.equal(((await hung.json()) as { night: unknown }).night, null);
  assert.ok(Date.now() - started < 5_000, `held ${Date.now() - started}ms`);

  /* AND A DIRECTORY THAT THROWS IS `null` BESIDE A 200: the Worker answering is the liveness. */
  kept = new Error('the Directory is down');
  const down = await ask('/healthz');
  assert.equal(down.status, 200);
  assert.equal(((await down.json()) as { night: unknown }).night, null);
  kept = null;
});

test('THE CRON KEEPS ITS NIGHT FOR /healthz, and a night that cannot run mails "BrainDog night" before it goes red', async () => {
  const { cloud } = await import('./cloud-harness.ts');
  const sent: Record<string, unknown>[] = [];
  const mail = { OPS_ALERT_TO: 'ops@example.test', MAIL_FROM: 'hello@brain.example.test', EMAIL: { send: async (m: Record<string, unknown>) => void sent.push(m) } };
  const c = await cloud(mail);
  const kv = new Map<string, unknown>();
  Object.assign(c.dirStorage, { get: async (k: string) => kv.get(k), put: async (k: string, v: unknown) => void kv.set(k, v) });
  await c.provision('rec_01JZ8QK3F7R2M9V4XN6TCB5HAJ', 'nightly', 'ada@example.test');
  const scheduled = (c.bundle.default as unknown as { scheduled(c: object, env: object, ctx: object): Promise<void> }).scheduled;
  const quietly = async (fn: () => Promise<unknown>) => {
    const kept = [console.log, console.error];
    console.log = console.error = () => {};
    try {
      return await fn();
    } finally {
      [console.log, console.error] = kept as [typeof console.log, typeof console.error];
    }
  };
  await quietly(() => scheduled({}, c.env, { waitUntil: () => {} }).catch(() => {}));
  const night = kv.get('ops-night') as Record<string, unknown> | undefined;
  assert.ok(night, 'the walk kept no night');
  /* THE DIRECTORY KEEPS THE COUNT, AND EVERY OTHER JOB OF THE NIGHT BY ITS FAILURES. */
  assert.equal(night['records'], 1);
  assert.deepEqual([night['backups'], night['directory'], sent.length], [1, 'ok', 0], 'a whole night mails nobody');
  assert.deepEqual([night['expiry_failed'], night['stragglers'], night['erase_open']], [0, 0, 0], JSON.stringify(night));
  const said = (await (await c.ask('/healthz')).json()) as { night: Record<string, unknown> };
  assert.equal(said.night['reached'], true);
  assert.equal('records' in said.night || 'backups' in said.night, false, 'a stranger read how many records there are');
  assert.equal(said.night['ran'], true, JSON.stringify(said.night));

  /* NO BUCKET IS A NIGHT THAT CANNOT RUN: mailed, then thrown. */
  const bare = await cloud({ ...mail, BLOBS: undefined });
  const bareKv = new Map<string, unknown>();
  Object.assign(bare.dirStorage, { get: async (k: string) => bareKv.get(k), put: async (k: string, v: unknown) => void bareKv.set(k, v) });
  await quietly(() => assert.rejects(scheduled({}, bare.env, { waitUntil: () => {} }), /no BLOBS binding/u));
  assert.ok(sent.some((m) => m['subject'] === 'BrainDog night'), 'no night mail went');
  /* AND IT IS KEPT AS A NIGHT THAT STOPPED, so the night before it does not go on saying it ran. */
  assert.equal((bareKv.get('ops-night') as { stopped?: boolean } | undefined)?.stopped, true);
});
