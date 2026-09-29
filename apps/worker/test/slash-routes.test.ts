/**
 * Two of Slash's three new doors on the Worker, `GET /api/slash/status` and `POST /api/slash/settings`, driven through
 * the router and the object as they ship. `POST /api/slash/propose` is
 * not driven here. It sits behind the same two locks and the same router branch, which read the path and not the route,
 * and what it adds is the `ask_id` handed through, which `packages/host/test/slash-ask.test.ts` holds.
 *
 * NO LINE OF THIS APP CHANGED TO MOUNT THEM, which is why they need driving here. `Record$.#answer` hands a request to
 * `serveSlash` on the truth of `servesSlash`, and the router refuses a bearer on `servesSlash(...) !== null`, so widening
 * that one function in `packages/host` put three doors behind both of this host's locks at once. Whether the locks
 * written for `read` hold at the new paths is the question, and `packages/host/test/slash-ask.test.ts` cannot ask it:
 * there is no router and no `Record$` in that suite. So the same three cases `slash.test.ts` and `slash-demo.test.ts`
 * hold at `read` are held here at status and settings, and the last case goes to workerd for the one thing a
 * `node:sqlite` double cannot say, that status and settings answer on a Durable Object's own storage.
 *
 * RED BEFORE THE DOORS WERE ROUTED, MEASURED with `aa763cdf^`'s `packages/host/src/slash-ask.ts` swapped in by an esbuild
 * `onLoad` in a scratch bundle outside the tree and nothing in the tree changed: all three tests failed on a 404
 * `ROUTE_UNKNOWN`, and the note above each group says which sentence and what it meant.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/* A PERSON CONTEXT NO SIGN-IN BUILT, the shape the public demo forwarded until it went.
   The demo is gone and the object's lock is not, so the lock is held here to a context a forged or mis-wired door could
   still hand it. */
const UNCREDENTIALED = { principal: { kind: 'person', id: 'p_demo', level: 'read' }, credentialed: false };

/* NOT A SECRET: the fake KEK `slash-demo.test.ts` binds, so the Worker has a key path and builds an engine at all. */
const FAKE_KEK = '0'.repeat(64);

type Reply = { status: number; body: { ok: boolean; value?: { asks?: { used: number; cap: number } }; refusal?: { code: string; fix?: string; at?: string } } };
const read = async (res: Response): Promise<Reply> => ({ status: res.status, body: (await res.json()) as Reply['body'] });

/** One hosted record with a model configured and a read token of its own, and the router's forwards counted. */
const hostedRecord = async () => {
  const { default: worker, Record$ } = await bundled();
  const env: Record<string, unknown> = { PUBLIC_HOST: HOST, KEK: FAKE_KEK, INGRESS: { send: async () => {} } };
  const state = { storage: objectStorage(), id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  const object = new Record$(state, env);
  /* WHAT THE ROUTER FORWARDS IS COUNTED, so a refusal at the router is told apart from the object's own below it. */
  const forwarded: string[] = [];
  const stub = new Proxy(object, {
    get: (target, key) =>
      key === 'fetch' ? (r: Request) => (forwarded.push(new URL(r.url).pathname), target.fetch(r)) : (target as never as Record<PropertyKey, Function>)[key]!.bind(target),
  });
  env['RECORD'] = { idFromName: (n: string) => n, get: () => stub };
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC }) };
  const made = await object.create({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.test', name: 'Ada' } });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);

  /* THE TOKEN IS THE RECORD'S OWN, minted through the method a session reaches, so the router resolves it through the
     object's real `verify` and `access` and a refusal below is about the path and not about an unknown bearer. */
  const owner = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
  const mint = new Request(`${ORIGIN}/api/createToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner) },
    body: JSON.stringify({ scope: 'read', label: 'cli' }),
  });
  const minted = (await (await object.fetch(mint)).json()) as { ok: boolean; value: { bearer: string } };
  assert.ok(minted.ok, `the record minted no token: ${JSON.stringify(minted)}`);
  return { worker, object, env, bearer: minted.value.bearer, owner, forwarded };
};

/** A request to one of the doors, with the context the router would have decided in its header when there is one. */
const door = (route: 'status' | 'settings', headers: Record<string, string>, body?: object) =>
  new Request(`${ORIGIN}/api/slash/${route}`, {
    method: route === 'status' ? 'GET' : 'POST',
    headers: route === 'status' ? { 'sec-fetch-site': 'same-origin', ...headers } : { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/* ── somebody who never signed in, at the object ─────────────────────────────────────────────────────────────────────── */

/* THE OBJECT'S TWO LOCKS RUN ON `servesSlash`'s TRUTH, before the door is asked which route it is, so they cover a path
   only once the function names it. Measured with the old door bundled: the demo's status GET went past both locks to
   `serveApi` and answered 404 `ROUTE_UNKNOWN`, "There is no method called slash/status." That was harmless only because
   nothing answered the path; the day a door did, a lock that had not been widened with it would have let the demo in. */
test('AN UNCREDENTIALED PERSON IS REFUSED AT STATUS AND AT SETTINGS, as at read, and the setting does not move', async () => {
  const { object, owner } = await hostedRecord();
  const stranger = { 'x-braindog-ctx': JSON.stringify(UNCREDENTIALED) };

  const status = await read(await object.fetch(door('status', stranger)));
  assert.equal(status.status, 403, `somebody who never signed in read Slash's status: ${JSON.stringify(status.body)}`);
  assert.equal(status.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(status.body.refusal?.at, 'principal');

  const settings = await read(await object.fetch(door('settings', stranger, { ask_cap: 1000 })));
  assert.equal(settings.status, 403, `somebody who never signed in configured Slash: ${JSON.stringify(settings.body)}`);
  assert.equal(settings.body.refusal?.code, 'NEEDS_BROWSER_SESSION');

  /* A SIGNED-IN OWNER STILL GETS THROUGH, and reads the default cap, so the refusal above wrote nothing. */
  const seen = await read(await object.fetch(door('status', { 'x-braindog-ctx': JSON.stringify(owner) })));
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  assert.equal(seen.body.value?.asks?.cap, 80, 'the refused patch was written anyway');
});

/* ── a bearer, at the router ─────────────────────────────────────────────────────────────────────────────────────────── */

/* THE ROUTER'S BRANCH IS `servesSlash(url.pathname) !== null`, and before these doors were routed that function answered `null` at these
   paths, so the router resolved the bearer and forwarded it. Measured with the old door bundled: the settings POST
   reached the object and was answered 404 `ROUTE_UNKNOWN`, "There is no method called slash/settings." That forward is
   what would cost something now the object answers the path: `inward()` deletes `authorization`, so a bearer let through
   to settings would meet only the object's person lock, and `forwarded` is what tells the router's refusal from that one. */
test('A BEARER THE RECORD KNOWS IS REFUSED AT SETTINGS AND AT STATUS BY THE ROUTER, and the object is never asked', async () => {
  const { worker, env, bearer, forwarded, object, owner } = await hostedRecord();
  const auth = { authorization: `Bearer ${bearer}` };

  const settings = await read(await worker.fetch(door('settings', auth, { ask_cap: 1000 }), env, { waitUntil: () => {} }));
  assert.equal(settings.status, 403, `a token configured Slash: ${JSON.stringify(settings.body)}`);
  assert.equal(settings.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(settings.body.refusal?.at, 'principal');

  const status = await read(await worker.fetch(door('status', auth), env, { waitUntil: () => {} }));
  assert.equal(status.status, 403, `a token read Slash's status: ${JSON.stringify(status.body)}`);
  assert.equal(status.body.refusal?.code, 'NEEDS_BROWSER_SESSION');

  assert.deepEqual(forwarded, [], 'the router forwarded a token to a Slash door and left the refusal to the object');
  const seen = await read(await object.fetch(door('status', { 'x-braindog-ctx': JSON.stringify(owner) })));
  assert.equal(seen.body.value?.asks?.cap, 80);
});

/* ── workerd, on a Durable Object's own SQLite ───────────────────────────────────────────────────────────────────────── */

/**
 * THE HARNESS OF `slash-in-do.test.ts`, BECAUSE THE DOUBLE ABOVE HAS NO AUTHORIZER. That file exists because every test
 * over `objectStorage()` was green while the real object could not build the engine (`SQLITE_AUTH` on an unguarded
 * `PRAGMA`), and `configure` is the first write to Slash's `settings` table any door has made, so it is the statement the
 * double is least able to vouch for. Bundling, the Miniflare options and the sign-in are that file's. No model is served:
 * neither door here calls one.
 */

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

/* NOT SECRETS. They guard a Worker that lives in this process for a few seconds. */
const PROVISION_KEY = 'slash-routes-operator-key-not-a-secret';
const SESSION_SECRET = 'slash-routes-session-secret-not-a-secret-0123456789';

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
let cookie = '';

before(async () => {
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Record$', useSQLite: true }, DIRECTORY: { className: 'Directory$', useSQLite: true } },
      queueProducers: { INGRESS: 'braindog-ingress' },
      bindings: {
        PUBLIC_HOST: HOST,
        SESSION_SECRET,
        PROVISION_KEY,
        PROVISION_WITHOUT_KEYS: 'yes',
        BRAINDOG_BUILD: '',
        /* A `KEK` AND NO INCLUDED MODEL: an engine is built because a key of his could be opened, and nothing here asks it. */
        KEK: FAKE_KEK,
      },
    }),
  );
  base = (await mf.ready).origin;

  const provisioned = await fetch(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug: 'asking', email: 'owner@example.test', name: 'Asking' }),
  });
  const made = (await provisioned.json()) as { ok: boolean; value?: { claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(made));
  const redeemed = await fetch(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: made.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  cookie = set.split(';')[0]!;
});

after(async () => {
  await mf?.dispose();
});

/* BEFORE THESE DOORS WERE ROUTED THE STATUS GET ANSWERED 404 `ROUTE_UNKNOWN` HERE, measured in workerd with the old door bundled: "There is
   no method called slash/status.", which is `serveApi` reading the path as a record method once `servesSlash` said no. */
test("ON A DURABLE OBJECT, STATUS ANSWERS 200 TO A PALETTE THAT SENDS NO ORIGIN, and an owner's cap is read back", async () => {
  /* WHAT A BROWSER SENDS ON A SAME-ORIGIN GET: the cookie and `Sec-Fetch-Site`, and no `Origin`. */
  const status = await fetch(`${base}/api/slash/status`, { headers: { cookie, 'sec-fetch-site': 'same-origin' } });
  const seen = (await status.json()) as Reply['body'];
  assert.equal(status.status, 200, `status on real storage answered ${String(status.status)}: ${JSON.stringify(seen)}`);
  assert.deepEqual(seen.value?.asks && { used: seen.value.asks.used, cap: seen.value.asks.cap }, { used: 0, cap: 80 });

  const set = await fetch(`${base}/api/slash/settings`, {
    method: 'POST',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ ask_cap: 3 }),
  });
  assert.equal(set.status, 200, `settings on real storage answered ${String(set.status)}: ${await set.text()}`);

  const again = (await (await fetch(`${base}/api/slash/status`, { headers: { cookie, 'sec-fetch-site': 'same-origin' } })).json()) as Reply['body'];
  assert.equal(again.value?.asks?.cap, 3, `the cap written on the object was not read back: ${JSON.stringify(again)}`);
});
