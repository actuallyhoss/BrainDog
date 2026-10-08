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
 * NO DURABLE OBJECT, NO DIRECTORY, NO CREDENTIAL. A liveness probe that woke a record would be a probe that costs a
 * storage read every minute and fails when one record is sick, which is not the question it asks. The env here throws
 * on every binding a record or the Directory would need, so a route that reached for one fails the test by name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';

import { PRIMITIVES_VERSION } from '../../../packages/render/src/kinds.ts';
import { launchState } from '../src/launch.ts';
import { bundled } from './bundled-worker.ts';

/* `53 §13 #9`'s TUPLE, EACH FROM THE MODULE THAT OWNS IT, so a build that moved one and not this door goes red here. */
const TUPLE = { format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: PRIMITIVES_VERSION };

const touched: string[] = [];
const trap = (name: string) =>
  new Proxy({}, { get: (_, key) => { touched.push(`${name}.${String(key)}`); throw new Error(`${name} was reached for /healthz`); } });

/* PRODUCTION'S SHAPE ON 8 OCTOBER: open, no bot check keyed, billing off (DIRECTION §42). */
const LAUNCH_ENV = { SIGNUP: 'open', BILLING: '' };
const LAUNCH = launchState(LAUNCH_ENV);

async function ask(path: string, init: RequestInit & { host?: string; build?: string; vars?: Record<string, string> } = {}) {
  const { default: worker } = await bundled();
  const env = {
    PUBLIC_HOST: 'brain.example.test',
    LEGACY_HOSTS: 'app.brain.example.test',
    ...LAUNCH_ENV,
    ...init.vars,
    BRAINDOG_BUILD: init.build ?? '2026.09.23+abc1234',
    RECORD: trap('RECORD'),
    DIRECTORY: trap('DIRECTORY'),
    INGRESS: trap('INGRESS'),
    ASSETS: trap('ASSETS'),
  };
  return worker.fetch(new Request(`https://${init.host ?? 'brain.example.test'}${path}`, init), env, { waitUntil: () => {} });
}

test('GET /healthz IS 200 WITH THE TUPLE OF 53 §13 #9, `ok` BESIDE IT, with no-store, and touches no object', async () => {
  touched.length = 0;
  const out = await ask('/healthz');
  assert.equal(out.status, 200, await out.clone().text());
  assert.deepEqual(await out.json(), { ok: true, app: '2026.09.23+abc1234', ...TUPLE, launch: LAUNCH });
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.match(out.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(touched, [], 'a binding was reached for a liveness probe');
});

test('AN UNSET BUILD IS null, as `/.well-known/braindog-build` says it', async () => {
  assert.deepEqual(await (await ask('/healthz', { build: '' })).json(), { ok: true, app: null, ...TUPLE, launch: LAUNCH });
});

test('HEAD ANSWERS HEAD: the same status and headers, and no body', async () => {
  touched.length = 0;
  const out = await ask('/healthz', { method: 'HEAD' });
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.equal(await out.text(), '');
  assert.deepEqual(touched, []);
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
  assert.deepEqual(await out.json(), { ok: true, app: '2026.09.23+abc1234', ...TUPLE, launch: LAUNCH });
});

test('HEALTH CARRIES THE LAUNCH: open, no bot check, and the sentence that says sign-ups from one address are limited', async () => {
  const out = (await (await ask('/healthz')).json()) as { launch: { signup: string; botCheck: boolean; billing: string; why: string[] } };
  assert.equal(out.launch.signup, 'open');
  assert.equal(out.launch.botCheck, false);
  assert.equal(out.launch.billing, 'off');
  assert.ok(
    out.launch.why.includes('The bot check is not keyed, so sign-ups from one address are limited to 3 an hour until it is.'),
    out.launch.why.join(' | '),
  );
  /* ONLY WHETHER THE SECRET IS SET IS READ: its value never reaches the answer. */
  const keyed = await ask('/healthz', { vars: { TURNSTILE_SECRET: '0x-a-secret-value', TURNSTILE_SITE_KEY: '0x-site' } });
  const text = await keyed.text();
  assert.ok(!text.includes('0x-a-secret-value'), 'the secret was answered');
  assert.equal((JSON.parse(text) as { launch: { botCheck: boolean } }).launch.botCheck, true);
});
