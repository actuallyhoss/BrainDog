/**
 * Slash's ask, driven through the Worker as it ships, in workerd, on a Durable Object's own SQLite.
 *
 * WHY THIS FILE EXISTS. Every other test of the ask ran over `objectStorage()` (`test/bundled-worker.ts`), a `node:sqlite`
 * double with no authorizer, and every one of them was green while the real object could not build the engine at all.
 * `createSlash` ran `PRAGMA user_version = 1` unguarded, a Durable Object's authorizer answers that statement
 * `not authorized: SQLITE_AUTH`, and so every ask on the Worker was 500 `INTERNAL` (`loop/research-spark-seam.md` §4). The
 * directory had met the same refusal first (`packages/record/src/directory.ts`), and `test/import-in-do.test.ts` is the
 * harness that can see a fault of that kind, so this file copies its bundling, its Miniflare options and its sign-in.
 *
 * WHAT A PERSON SAW IS TWO ANSWERS THAT DISAGREE, and both are asserted. `/api/version` says `slash: true`, because that flag
 * is the record's model being configured and never builds the engine, so the palette offers the ask; the ask itself was the
 * 500. The flag is asserted true on the run that failed as well as on the run that passed, so the test says which half moved.
 *
 * THE MODEL IS A `node:http` SERVER ON 127.0.0.1 AND IT IS COUNTED. A 200 that never reached the model reads as green if only
 * the status is checked, and that is exactly what this file found once the pragma was guarded: see the `todo` at the end.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const OWNER = 'owner@example.test';
const SLUG = 'asking';
/* NOT SECRETS. They guard a Worker that lives in this process for a few seconds. */
const PROVISION_KEY = 'slash-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'slash-in-do-session-secret-not-a-secret-0123456789';
/* THE FAKE KEK `slash-demo.test.ts` uses: bound, so the Worker has a key path and builds a model at all. */
const FAKE_KEK = '0'.repeat(64);

let mf: InstanceType<typeof Miniflare> | undefined;
let model: Server | undefined;
let calls = 0;
let base = '';
let cookie = '';

before(async () => {
  /* ONE CHAT COMPLETION, the pass-1 draft `slash-demo.test.ts` answers with: no register named, no predicate, a keyword. */
  model = createServer((req, res) => {
    calls++;
    req.resume();
    req.on('end', () => {
      const content = '{"registers":[],"where":null,"q":"open"}';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise<void>((resolve) => model!.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${String((model.address() as AddressInfo).port)}/v1/chat/completions`;

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
        SLASH_ENDPOINT: endpoint,
        KEK: FAKE_KEK,
      },
    }),
  );
  base = (await mf.ready).origin;

  const provisioned = await fetch(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug: SLUG, email: OWNER, name: 'Asking' }),
  });
  const made = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(made));
  const redeemed = await fetch(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: made.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  cookie = set.split(';')[0]!;

  /* A PACK, BECAUSE A RECORD WITH NO LISTS IS ASKED NOTHING. The first green run of this file answered 200 with zero calls to
     the model: a freshly provisioned record has no registers, and pass 1 answers `nothing` without drafting a predicate
     (`packages/slash/test/palette.test.ts`), which is right and is not the path this file is about. */
  const filed = await owner().call<{ id: string }>('propose', { question: 'Install usecase-founder?', body_kind: 'pack', body: { install: 'usecase-founder' } });
  assert.ok(filed.ok, `the pack could not be offered: ${JSON.stringify(filed)}`);
  const accepted = await owner().call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the ask needs a list to read' } });
  assert.ok(accepted.ok, `the pack would not install: ${JSON.stringify(accepted)}`);
});

after(async () => {
  await mf?.dispose();
  await new Promise<void>((resolve) => (model ? model.close(() => resolve()) : resolve()));
});

const owner = (): Client =>
  createClient({
    base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return fetch(input, { ...init, headers: sent });
    },
  });

test('/api/version offers Slash on this Worker, which is what puts the ask in the palette', async () => {
  const version = await owner().call<{ slash: boolean }>('version', {});
  assert.ok(version.ok, JSON.stringify(version));
  assert.equal(version.value.slash, true);
});

/** One ask through the router, as the palette sends it: the session cookie, the app's origin, and no bearer. */
const ask = async (): Promise<{ status: number; body: string; calls: number }> => {
  const from = calls;
  const res = await fetch(`${base}/api/slash/read`, {
    method: 'POST',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'What is still open?' }),
  });
  return { status: res.status, body: await res.text(), calls: calls - from };
};

test('THE ASK IS ANSWERED ON A DURABLE OBJECT, and not a 500 naming SQLITE_AUTH', async () => {
  const out = await ask();
  assert.equal(out.status, 200, `the ask was answered ${String(out.status)}: ${out.body}`);
  const reading = JSON.parse(out.body) as { ok: boolean; value?: { ask_id: string } };
  assert.equal(reading.ok, true, out.body);
  assert.equal(typeof reading.value?.ask_id, 'string');
});

/* A SECOND FAULT BEHIND THE FIRST, and not this file's to repair. With the pragma guarded the ask answers 200, but the model is
   never called: workerd throws `Invalid redirect value, must be one of "follow" or "manual"` out of `fetch` at the
   `redirect: 'error'` in `packages/host/src/slash.ts`'s `post`, `core.run` reads that as `UNREACHABLE`, and pass 1 falls back to
   the question as keywords. Measured on 22 September by logging the throw inside workerd, and then by bundling this same file
   with that one value swapped for `'manual'` in memory: both tests went green with exactly one call to this server. So Miniflare
   does reach 127.0.0.1; the Worker's own request is what is refused. The record's model (`endpointModel`) posts through the same
   function, so `slashPropose` and `slashForm` on the Worker fall to the rules the same way. When `post` is repaired this `todo`
   passes, and the marker comes off. */
test(
  'THE ASK REACHES THE MODEL, exactly once',
  async () => {
    const out = await ask();
    assert.equal(out.status, 200, out.body);
    assert.equal(out.calls, 1, `the ask did not reach the model exactly once: ${out.body}`);
  },
);
