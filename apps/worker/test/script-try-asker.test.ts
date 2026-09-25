/**
 * Whose name a trial opens the owner's key in on the Cloud: `Record$`'s `tryScript`, as `src/index.ts` ships it, and the
 * `grant.read` it leaves in the vault's log. The self-host's half is `apps/selfhost/test/script-try-asker.test.ts`.
 *
 * `Record$` OPENED A TRIAL'S KEY WITH THE ALARM'S OPENER. `#openKey(api)` is `keyOpener(api, env.KEK)`, whose actor is
 * `system` because the alarm has nobody behind it, and `tryScript` called it the same way, so the owner trying her draft
 * signed nothing. The Slash door fixed the same fault on this host with `slashAskerEngine` (`slash.test.ts`, "opens the
 * `slash` key for the asker").
 *
 * THE OBJECT IS REAL AND SO IS THE KEY. `src/index.ts` bundled by `wrangler`'s esbuild (`bundled-worker.ts`), its record
 * over `node:sqlite`, the key put through `serveWorkerKeys` with this Worker's own sealing under a bound `KEK`, and the
 * trial asked at `/api/scriptTry` with an owner's context. Two things stand in: `LOADER`, which Node has not got, by a
 * double whose loaded "Worker" makes the one call a script's `ctx.fetch` makes, `script(run, { op: 'fetch' })` on the
 * object, and the socket, by a `fetch` double that records what was sent. Everything between the two is shipped code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';
import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { serveWorkerKeys } from '../src/vault.ts';

const HOST = 'app.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER_ID = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const KEK = 'a'.repeat(64);
const GOLD = 'https://api.gold.test';

const DRAFT = {
  script: 'gold-rate',
  runs: { every: '1d' },
  egress: [GOLD],
  keys: ['goldapi'],
  reads: [],
  writes: [],
  source: `export default async function run(ctx) { await ctx.fetch('${GOLD}/rate', { key: 'goldapi' }); }`,
};

type Reply = { ok?: unknown; error?: string };
type Scripting = { script(run: string, call: object): Promise<Reply> };

test("THE OWNER'S TRIAL ON THE CLOUD OPENS HER KEY IN HER NAME, and the grant.read is signed by her and not by system", async () => {
  const { Record$ } = await bundled();
  const storage = objectStorage();
  let object!: Scripting & { create(args: object): Promise<unknown>; fetch(r: Request): Promise<Response>; depositGrant: Function; wrappingKey: Function; openForGrant: Function };

  /* THE LOADER DOUBLE: the loaded Worker's `run` asks the object for the one fetch the draft's source makes, with the
     key by label, which is what the prelude's `ctx.fetch` and `ScriptOutbound` hand `ScriptRuns.answer` in workerd. */
  const replies: Reply[] = [];
  const LOADER = {
    load: () => ({
      getEntrypoint: (_name: unknown, opts: { props: { run: string } }) => ({
        run: async () => {
          const reply = await object.script(opts.props.run, { op: 'fetch', url: `${GOLD}/rate`, asked: null, method: 'GET', headers: {}, body: null, key: 'goldapi' });
          replies.push(reply);
          return { writes: [], log: '' };
        },
      }),
    }),
  };
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    KEK,
    LOADER,
    INGRESS: { send: async () => {} },
    DIRECTORY: { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC, mayRun: async () => null, meter: async () => {} }) },
  };
  const state = {
    storage,
    id: { toString: () => REC },
    blockConcurrencyWhile: (f: () => unknown) => f(),
    waitUntil: () => {},
    exports: { ScriptRecord: () => ({}), ScriptOutbound: () => ({}) },
  };
  object = new Record$(state, env) as never;
  env['RECORD'] = { idFromName: (n: string) => n, get: () => object };
  const store = (await keyStoreOf(KEK)) ?? assert.fail('the KEK did not make a key store');
  const made = await object.create({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: OWNER_ID, email: 'ada@example.test', name: 'Ada' }, keys: await recordKeys(store, REC) });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);

  const owner = { principal: { kind: 'person', id: OWNER_ID, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const call = async (method: string, args: object) => {
    const res = await object.fetch(
      new Request(`https://${HOST}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner) }, body: JSON.stringify(args) }),
    );
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: { id?: string } } };
  };

  /* THE KEYS LIST COMES WITH THE AGENTS PACK, offered and accepted the way `slash-in-do.test.ts` installs one. */
  const filed = await call('propose', { question: 'Install agents?', body_kind: 'pack', body: { install: 'agents' } });
  assert.ok(filed.body.ok, JSON.stringify(filed));
  const accepted = await call('decide', { id: filed.body.value?.id, decide: { option: 'accept', reason: 'the vault needs its list' } });
  assert.ok(accepted.body.ok, JSON.stringify(accepted));

  /* THE KEY, PUT THROUGH THE APP'S OWN KEY DOOR for a fresh owner session, sealed by this Worker's key store. */
  const value = `bd_fake_gold_${crypto.randomUUID().replaceAll('-', '')}`;
  const put = await serveWorkerKeys(
    new Request(`https://${HOST}/api/keys/put`, {
      method: 'POST',
      headers: { origin: `https://${HOST}`, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'goldapi', opens: 'api.gold.test', value }),
    }),
    owner as never,
    {
      origins: new Set([`https://${HOST}`]),
      record: REC,
      keys: {
        store: () => keyStoreOf(KEK),
        wrappingKey: () => object.wrappingKey(),
        depositGrant: (_id: string, args: object, by: object, hints: object, seal: Function) => object.depositGrant(args, by, hints, seal),
        openForGrant: (_id: string, args: object, by: object, hints: object, kekId: string) => object.openForGrant(args, by, hints, kekId),
      } as never,
    },
  );
  assert.equal(put.status, 200, await put.text());

  /* THE SOCKET DOUBLE, so the provider is never dialled and what would have gone out is kept. */
  const sent: (string | null)[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    sent.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization'));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  let tried: Response;
  try {
    tried = await object.fetch(
      new Request(`https://${HOST}/api/scriptTry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner) },
        body: JSON.stringify({ body: DRAFT }),
      }),
    );
  } finally {
    globalThis.fetch = real;
  }
  const answer = await tried.text();
  assert.equal(tried.status, 200, answer);
  /* THE WITNESS THAT A KEY WAS OPENED AT ALL, or an empty log below would pass by opening nothing. */
  assert.equal(sent.length, 1, `${answer} ${JSON.stringify(replies)}`);
  assert.ok(sent[0] === `Bearer ${value}`, 'the trial did not send the owner key it opened');
  const reads = storage.sql.exec("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").toArray() as { actor: string }[];
  assert.deepEqual(reads.map((r) => r.actor), [OWNER_ID], 'the grant.read was not signed by the owner who asked for the trial');
});
