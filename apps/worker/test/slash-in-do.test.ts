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
 * THE MODEL IS HIS OWN KEY'S, AND IT IS COUNTED (`loop/finish/defects.md` G4). The Worker has no endpoint of its own any more;
 * a record reaches a model it did not come with only through the key its owner picked. So the owner puts an API token in
 * the vault through the key door, picks it in Settings with a provider, an address and a model, and the ask is answered by
 * Miniflare's `outboundService`, which is every `fetch` the Worker makes. It counts the calls and keeps the address and the
 * header each carried. A 200 that never reached the model reads as green if only the status is checked, which is what
 * this file once found; and a call that reached it without the key is the fault S2 names, so the header is asserted too.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const miniflare = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
  Response?: typeof Response;
};
const { Miniflare, convertV4MiniflareOptions } = miniflare;
/* MINIFLARE'S OWN `Response` WHERE IT EXPORTS ONE, since a handler it calls answers in its classes; the global otherwise. */
const Answer = miniflare.Response ?? Response;

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const OWNER = 'owner@example.test';
const SLUG = 'asking';
/* NOT SECRETS. They guard a Worker that lives in this process for a few seconds. */
const PROVISION_KEY = 'slash-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'slash-in-do-session-secret-not-a-secret-0123456789';
/* THE FAKE KEK `slash-demo.test.ts` uses: bound, so the Worker can seal and open a key of the owner's at all. */
const FAKE_KEK = '0'.repeat(64);
/* HIS PROVIDER, an address on a name reserved for tests, which `slashBaseUrlOf` reads as public and nothing resolves. */
const PROVIDER = 'https://model.example.test/v1';
/* NOT A SECRET: the value put in the vault for this run, so the header the provider sees can be told to be his. */
const HIS_TOKEN = 'slash-in-do-provider-token-not-a-secret';

let mf: InstanceType<typeof Miniflare> | undefined;
let calls = 0;
const reached: { url: string; authorization: string | null }[] = [];
let base = '';
let cookie = '';

before(async () => {
  /* ONE CHAT COMPLETION, the pass-1 draft `slash-demo.test.ts` answers with: no register named, no predicate, a keyword.
     Anything else the Worker fetches is answered 502 and counted too, so a call to somewhere unexpected is seen. */
  const provider = (request: Request): Response => {
    calls++;
    reached.push({ url: request.url, authorization: request.headers.get('authorization') });
    if (!request.url.startsWith(PROVIDER)) return new Answer('not the provider', { status: 502 });
    const content = '{"registers":[],"where":null,"q":"open"}';
    return new Answer(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

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
      outboundService: provider,
      /* NO `AI` AND NO `SLASH_INCLUDED`: the included model is off, so the only model this Worker can reach is his key. */
      bindings: {
        PUBLIC_HOST: HOST,
        SESSION_SECRET,
        PROVISION_KEY,
        PROVISION_WITHOUT_KEYS: 'yes',
        BRAINDOG_BUILD: '',
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

  /* HIS KEY, PUT IN THROUGH THE KEY DOOR AS AN API TOKEN, and picked in Settings by its grant id. The sign-in above is a
     proof of a moment ago, so the vault's gate that both the key door and a save pointing his key somewhere ask is open. */
  const put = await owner().putKey({ label: 'model provider', opens: 'Slash', value: HIS_TOKEN, kind: 'api_token' });
  assert.ok(put.ok, `the key door would not take his key: ${JSON.stringify(put)}`);
  const grants = await owner().listGrants();
  assert.ok(grants.ok, JSON.stringify(grants));
  const grant = (grants.value as { id: string; label: string }[]).find((g) => g.label === 'model provider');
  assert.ok(grant, 'the key door filed no grant for his key');
  const saved = await owner().slashSettings({ source: 'key', provider: 'openai', base_url: PROVIDER, model: 'his-model', grant_id: grant.id });
  assert.ok(saved.ok, `Settings would not save his own key: ${JSON.stringify(saved)}`);
  assert.equal(calls, 0, 'something was sent before anything was asked');
});

after(async () => {
  await mf?.dispose();
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

/* `post` SENDS WITH `redirect: 'manual'`, which workerd takes; it once sent `'error'`, which workerd refuses outright, and the
   ask then answered 200 on the question as keywords with no call made (measured on 22 September). */
test('THE ASK REACHES HIS KEY, exactly once, at the address he named, carrying the key he picked', async () => {
  const from = reached.length;
  const out = await ask();
  assert.equal(out.status, 200, out.body);
  assert.equal(out.calls, 1, `the ask did not reach his provider exactly once: ${out.body}`);
  assert.deepEqual(reached.slice(from), [{ url: `${PROVIDER}/chat/completions`, authorization: `Bearer ${HIS_TOKEN}` }]);
});

/* HIS ASKS ARE LISTED AND NOT CAPPED (`loop/finish/agents.md` §5 item 7), and the one count that feeds the list is the one
   status reads, so the asks above are in it. */
test('ON HIS OWN KEY STATUS SAYS SO: the source, the provider, and a count with no cap', async () => {
  const status = await owner().slashStatus();
  assert.ok(status.ok, JSON.stringify(status));
  assert.equal(status.value.source, 'key');
  assert.equal(status.value.provider, 'openai');
  assert.equal(status.value.model, 'his-model');
  assert.equal(status.value.asks.capped, false);
  assert.ok(status.value.asks.used >= 1, `the asks on his key were not counted: ${JSON.stringify(status.value)}`);
  const asks = await owner().slashAsks();
  assert.ok(asks.ok, JSON.stringify(asks));
  assert.ok(asks.value.asks.some((a) => a.question === 'What is still open?'), JSON.stringify(asks.value));
});
