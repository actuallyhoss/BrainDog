/**
 * Slash on the Worker (`src/slash.ts`): the person's own key from the keychain, through the same port as the self-host, and the
 * daily look. The endpoint is a test double and every key an obviously fake value; nothing leaves the machine.
 *
 * AND THE THIRTEENTH PACKAGE, `@braindog/slash`, driven through both hosts' builders at the bottom of this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRecordApi } from '@braindog/record';
import type { Proposal } from '@braindog/slash';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { EMBED_MODEL } from '../src/inference.ts';
import { slashLook, workerSlashDoor, workerSlashEngine, workerSlashModel } from '../src/slash.ts';

const FAKE_KEK = '0'.repeat(64);
const FAKE_PERSON_KEY = 'fake-person-key-for-tests-only';

const net = () => {
  const sent: RequestInit[] = [];
  return { sent, send: async (_u: URL, init: RequestInit) => (sent.push(init), new Response('{"drafts":[]}', { status: 200 })) };
};

/** Slash's own store with the two tables `slashOwnKeyOf` reads, on the included model until a test chooses his key. */
const slashStore = () => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, 'a', NULL, NULL, 80, '2026-09-21T09:00:00.000Z')");
  return store;
};

/** His key chosen in that store, as Settings saves it: the grant by its id, a model, and his provider's address. */
const chooseKey = (store: { exec(sql: string, ...p: (string | number | null)[]): void }, grant: string) => {
  store.exec("UPDATE slash_settings SET tier = 'b', model = 'his-model', grant_id = ? WHERE singleton = 1", grant);
  store.exec("INSERT INTO slash_meta (key, value) VALUES ('own.provider', 'openai'), ('own.base_url', 'https://gateway.example.test/v1')");
};

test('NO INCLUDED MODEL AND NO KEK, NO MODEL: a hosted record says slash: false and the rules draft', () => {
  const api = () => ({ kernel: { grants: () => [] } }) as never;
  assert.equal(workerSlashModel({}, api), undefined);
  /* A `KEK` WITH NO STORE TO READ HIS CHOICE FROM IS NO MODEL EITHER: nothing could say which key to open. */
  assert.equal(workerSlashModel({ KEK: FAKE_KEK }, api), undefined);
  const store = slashStore();
  assert.ok(workerSlashModel({ KEK: FAKE_KEK }, api, { store: () => store }), 'a Worker that can open his key offered no Slash to set up');
  store.close();
});

test('NO KEY IS CHOSEN BY ITS LABEL: a live token labelled slash is never opened, and his own key is opened by its id on each call', async () => {
  const opened: string[] = [];
  const grants = [
    { id: 'g_label', label: 'slash', kind: 'api_token', revoked_at: null },
    { id: 'g_his', label: 'model provider', kind: 'api_token', revoked_at: null },
  ];
  const api = () => ({ kernel: { grants: () => grants } }) as never;
  const wire = net();
  const store = slashStore();
  const model = workerSlashModel({ KEK: FAKE_KEK }, api, {
    store: () => store,
    send: wire.send,
    open: () => async (grant) => (opened.push(grant.id), FAKE_PERSON_KEY),
  });
  assert.ok(model);

  /* NOTHING CHOSEN, AND NO INCLUDED MODEL HERE: the press is refused before anything is sent, and the `slash` key stays shut. */
  await assert.rejects(model.draft({} as never), /Pick your key in Settings/u);
  assert.deepEqual(opened, []);
  assert.equal(wire.sent.length, 0);

  /* HIS CHOICE COUNTS ON THE NEXT CALL, with no restart. */
  chooseKey(store, 'g_his');
  await model.draft({ usage: {} } as never);
  assert.deepEqual(opened, ['g_his']);
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, `Bearer ${FAKE_PERSON_KEY}`);
  const body = String(wire.sent[0]!.body);
  assert.ok(!body.includes(FAKE_PERSON_KEY), 'the key went into what the model reads');
  assert.equal((JSON.parse(body) as { model: string }).model, 'his-model');
  store.close();
});

test('THE DAILY LOOK runs once a day on a real record and never throws out of an alarm', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 17, 12));
  const api = await createRecordApi({ sql, clock });
  await slashLook(api);
  assert.equal(api.kernel.prefsOf('slash')['slash.last'], '2026-09-17');
  assert.deepEqual(await api.slashTick(), { ran: false, why: 'today' });
  await slashLook({ slashTick: async () => { throw new Error('offline'); } } as never);
  sql.close();
});

/* ── the thirteenth package, reached from both hosts ──────────────────────────────────────────────────────────────────── */

/**
 * `@braindog/slash` DRIVEN THROUGH EACH HOST'S OWN BUILDER, and the self-host's imported here beside the Worker's on purpose.
 *
 * THE CLAIM IS THAT THE TWO HOSTS AGREE, and a test that drives one of them cannot make it. `1f85a49a` settled that the
 * package is a second feature under one name rather than a newer version of the host's, and the thing that would then go
 * wrong quietly is one host reaching the engine while the other still answers from the rules. So both builders are asked the
 * same question against the same shape of record in one place, which is the assertion two separate files could not carry.
 *
 * THE RECORD IS REAL AND THE MODEL IS NOT. The rows go in through `api.create`, the projection comes back through the
 * record's own guarded reads, and the proposal lands on the record's Decide; only the endpoint is a double, because what is
 * under test is the wiring and a live call would be slow, paid for and differently wrong every run.
 */

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    /* A REGISTER IS SEARCHED ON THE FIELDS IT NAMES: `packages/host` measured that a titled row in a register declaring no
       `search:` line comes back from `search` as no rows at all, and the keyword fallback is one of the two reads here. */
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };

/** Pass 1 drafts the predicate, pass 2 writes the one cited proposal: `46 §5.4`'s two calls, in that order. */
const ANSWERS = (): string[] => [
  '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}',
  '{"text":"Two tasks are open and {{ref:tasks#1}} falls due first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"fields":{"what":"Chase the first"},"from":["tasks#1"]}]},"flagged":false}',
];

/** An endpoint that answers each queued completion once, with the token counts the meter bills. */
const modelDouble = () => {
  const queue = ANSWERS();
  const sent: RequestInit[] = [];
  return {
    sent,
    send: async (_url: URL, init: RequestInit) => {
      sent.push(init);
      const content = queue.shift() ?? '{}';
      return new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }),
        { status: 200 },
      );
    },
  };
};

/** Two open rows on a real record, which is what a projection and a citation are then about. */
const twoOpenTasks = async (clock: { now: () => number }) => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok, 'the register was not installed');
  for (const fields of [
    { what: 'Invoice Acme', amount: { amount: 500500, currency: 'EGP' }, due: '2026-10-01', state: 'open' },
    { what: 'Invoice Beta', amount: { amount: 120000, currency: 'EGP' }, due: '2026-10-08', state: 'open' },
  ])
    assert.ok((await api.create({ register: 'tasks', fields }, OWNER)).ok, 'the row was not written');
  return { sql, api };
};

/**
 * A REAL ASK ON HIS OWN KEY, THROUGH THE WORKER'S OWN DOOR BUILDER: the door opens his key for the asker (`byok`), and both
 * passes go to it. The opener records the actor it was built for, which is the actor the real `keyOpener` signs
 * `grant.read` with (`key-opener-actor.test.ts`), so the asker's name on both openings is measured here, not supposed.
 */
test("A REAL ASK ON HIS OWN KEY REACHES THE PACKAGE'S ENGINE THROUGH THE WORKER'S DOOR, both passes on his key, signed by the asker", async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const { sql, api } = await twoOpenTasks(clock);
  (api.kernel as { grants: () => unknown }).grants = () => [{ id: 'g_his', kind: 'api_token', label: 'model provider', revoked_at: null }];
  const own = openSqlite();
  const wire = modelDouble();
  const opened: (string | undefined)[] = [];

  const door = workerSlashDoor({ KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: wire.send,
    open: (_api, actor) => async () => (opened.push(actor), FAKE_PERSON_KEY),
  }, new Set());
  const engine = await door.engine!();
  assert.ok(engine, 'a Worker that can open his key built no engine');
  chooseKey(own, 'g_his');
  const key = await door.byok!(OWNER);
  assert.ok(key !== undefined && !(typeof key === 'object' && key !== null && 'refusal' in key), `his key was not opened: ${JSON.stringify(key)}`);

  const out = await engine.propose('Which tasks are open?', OWNER, key as never, undefined, key as never);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  /* `door.engine!()` IS TYPED BY THE HOST'S OWN `SlashAskEngine<C>`, whose `propose` answers `Result<unknown>` on
     purpose so `packages/host` never imports `@braindog/slash`. This test drives the
     package's real engine underneath it, so the answer is the package's own `Proposal`, cast back to it here rather
     than in the shared host type. */
  const proposed = out.value as Proposal;
  assert.equal(proposed.body_kind, 'rowset');
  assert.deepEqual(proposed.citations, ['tasks#1']);
  assert.match(String(proposed.filed), /^SG[0-9]+$/u, 'nothing was filed on the record');
  /* THE FOLD'S LAST LINE IS THE KEYCHAIN, REFUSED, on every ask (`46 §4.2`), which is the boundary showing in the output. */
  assert.deepEqual(proposed.read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });

  /* THE QUESTION IS ON THE REAL RECORD'S DECIDE. */
  const boot = (await api.boot(OWNER)) as { ok: boolean; value: { waiting: { id: string }[] } };
  assert.ok(boot.ok);
  assert.equal(boot.value.waiting.length, 1);
  assert.equal(boot.value.waiting[0]!.id, proposed.filed);

  /* AND THE ANSWER CAME FROM THE PACKAGE'S ENGINE AND NOT FROM THE RULES: two rows in Slash's OWN meter, and the record's
     own Slash still modelless, so nothing here could have come from `SlashModel.draft`. */
  assert.deepEqual(
    own.all<{ kind: string; status: string }>('SELECT kind, status FROM slash_call ORDER BY rowid').map((r) => `${r.kind}:${r.status}`),
    ['read:ok', 'propose:ok'],
  );
  const reading = (await api.slash({}, OWNER)) as { ok: boolean; value: { model: string | null } };
  assert.equal(reading.value.model, null);

  /* THE WIRE SAYS WHICH PORT SPOKE. `json_schema` with `strict` is `endpointInference`'s request and `endpointModel` never
     sends it: the record's model asks for a bare `json_object`. And the model is the name he typed, for both passes, the
     package's short names included: on his key `SLASH_MODEL` has no say (`ownOptionsOf`). */
  assert.equal(wire.sent.length, 2);
  const asked = JSON.parse(String(wire.sent[0]!.body)) as { model: string; response_format: { type: string; json_schema: { strict: boolean } } };
  assert.equal(asked.response_format.type, 'json_schema');
  assert.equal(asked.response_format.json_schema.strict, true);
  assert.equal(asked.model, 'his-model');
  /* BOTH PASSES ON HIS KEY, AND EACH OPENING SIGNED BY THE ASKER, never by `system`. */
  assert.ok(wire.sent.every((init) => (init.headers as Record<string, string>).authorization === `Bearer ${FAKE_PERSON_KEY}`), 'an ask did not go out on his key');
  assert.deepEqual(opened, ['p_owner', 'p_owner'], 'a grant.read of the ask was not signed by the asker');
  /* AND THE LEDGER KEEPS BOTH UNDER HIS TIER, which the included count and the operator's ceiling do not read. */
  assert.deepEqual(own.all<{ tier: string }>('SELECT tier FROM slash_call ORDER BY rowid').map((r) => r.tier), ['b', 'b']);

  sql.close();
  own.close();
});

test("AND THE SAME ASK REACHES IT THROUGH THE SELF-HOST'S BUILDER, over the operator's key", async () => {
  const { slashEngineFor } = await import('../../selfhost/src/slash.ts');
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const { sql, api } = await twoOpenTasks(clock);
  const own = openSqlite();
  const wire = modelDouble();

  const engine = await slashEngineFor(
    { url: 'http://localhost:11434/v1/chat/completions', key: 'fake-operator-key', send: wire.send },
    () => api,
    undefined,
    { sql: own, clock },
  );
  assert.ok(engine, 'a configured self-host built no engine');

  const out = await engine.propose('Which tasks are open?', OWNER);
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  assert.equal(out.value.body_kind, 'rowset');
  assert.deepEqual(out.value.citations, ['tasks#1']);
  assert.match(String(out.value.filed), /^SG[0-9]+$/u, 'nothing was filed on the record');

  /* FILED AS `slash`, which is the one actor this package's single write is allowed to be (`30 §3`). */
  const queue = (await api.governance({ limit: 5 }, OWNER)) as { ok: boolean; value: { body_kind: string; opened_by: string }[] };
  assert.ok(queue.ok);
  assert.equal(queue.value[0]!.body_kind, 'rowset');
  assert.equal(queue.value[0]!.opened_by, 'slash');
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, 'Bearer fake-operator-key');

  sql.close();
  own.close();
});

test('THE KEYLESS PATH BUILDS NO ENGINE EITHER, so a host with nothing configured keeps drafting with the rules', async () => {
  const deps = { sql: openSqlite(), clock: fixedClock(0) };
  const api = () => ({ kernel: { grants: () => [] } }) as never;
  assert.equal(await workerSlashEngine({}, api, deps), undefined);
  /* THE SWITCH WITH NO BINDING AND NO WAY TO OPEN A KEY IS STILL NOTHING, which is the rule `/api/version`'s own flag follows. */
  assert.equal(await workerSlashEngine({ SLASH_INCLUDED: 'yes' }, api, deps), undefined);
  const { slashEngineFor } = await import('../../selfhost/src/slash.ts');
  assert.equal(await slashEngineFor(undefined, api, undefined, deps), undefined);
  deps.sql.close();
});

/**
 * AND THE REFUSAL COMES BEFORE THE LOAD, HELD AS TEXT BECAUSE NOTHING INSIDE THIS PROCESS CAN SEE IT.
 *
 * Both builders say in prose that reversing those two lines would keep the feature working and lose the property, and that
 * is measured rather than supposed: with `await import('@braindog/slash')` moved above the refusal in both files, the six
 * tests above stay green, all six, because a builder that returns `undefined` after evaluating the module returns the same
 * `undefined`. Node evaluates an ES module once and offers no way to ask a running process which modules it holds, and the
 * two tests above have already loaded this one, so no later test in this file could observe the difference. `46 §5.1` is
 * about the load and not about the answer, so the order of the bytes is the only place the claim is checkable here.
 *
 * THE BUNDLE IS THE OTHER HALF AND IT IS NOT THIS FILE'S. What a keyless deployment actually ships is `wrangler`'s output,
 * which this test process never builds; this holds the source property that makes that output possible.
 */
test('NEITHER BUILDER LOADS THE PACKAGE BEFORE IT HAS DECIDED IT NEEDS IT', () => {
  for (const file of ['../src/slash.ts', '../../selfhost/src/slash.ts']) {
    const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    const refused = src.indexOf('if (inference === undefined) return undefined;');
    const loaded = src.indexOf("await import('@braindog/slash')");
    assert.ok(refused !== -1, `${file}: no builder refuses on an endpoint that built no inference`);
    assert.ok(loaded !== -1, `${file}: the package is not loaded dynamically at all`);
    assert.ok(loaded > refused, `${file}: the package is loaded at line ${src.slice(0, loaded).split('\n').length}, before the refusal`);
  }
});

/* ── the ask's door on the Cloud, through the Worker's own router ────────────────────────────────────────────────────── */

/**
 * A TOKEN AT `/api/slash/read`, DRIVEN THROUGH THE ROUTER AND THE OBJECT AS THEY SHIP.
 *
 * `serveSlash` refuses any `authorization` header with 403 `NEEDS_BROWSER_SESSION`, and on its own it does. But on this host
 * the router resolves the bearer to a context and `inward()` then deletes the header, so the door's first check never sees
 * one, and what was left standing was the `Origin` check, which any client that is not a browser sets to whatever it likes.
 * It was measured: `inward()` into `serveSlash` answering 200 with the TOKEN's context. These
 * two tests drive the same hole one level further out: `export default`'s own `fetch`, a real `Record$` holding a real
 * record, a bearer that record minted through `createToken`, and the app's own origin sent by hand. Before the refusals
 * existed both answered 200 with a Reading and the model endpoint was called once each, which on a live host is one opening
 * of the person's own keychain key and one ask off `ask_cap`, spent by an MCP token or a CLI login (`46 §5.2`). With the two
 * locks in, each one disabled on its own turns exactly one of the two red, which is why there are two tests and not one.
 *
 * `src/index.ts` IMPORTS `cloudflare:workers`, which `node --test` cannot load, and the other tests here read it as text for
 * that reason. Text cannot tell a refusal that runs from one written after the `return` that forwards, so the file is
 * bundled by `wrangler`'s own esbuild with that one import answered by a two-line base class, which is all `Record$` takes
 * from it. The object's storage is `node:sqlite` behind the calls the Worker makes of a Durable Object's `storage`, and the
 * one outbound call, the model, is `globalThis.fetch` answered here. Bundling takes about 150 ms.
 */

type Handler = { fetch(request: Request, env: object, ctx: object): Promise<Response> };
type RecordObject = { fetch(request: Request): Promise<Response>; create(args: object): Promise<unknown> };
type Bundle = { default: Handler; Record$: new (ctx: object, env: object) => RecordObject };

const HOST = 'app.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** `src/index.ts` as one module, bundled the way `wrangler` would bundle it, with `cloudflare:workers` a bare base class. */
const bundled = async (): Promise<Bundle> => {
  const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
  const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'cloudflare-workers',
        setup(b: { onResolve: Function; onLoad: Function }) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cf', namespace: 'cf' }));
          b.onLoad({ filter: /.*/, namespace: 'cf' }, () => ({
            contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
            loader: 'js',
          }));
        },
      },
    ],
  });
  /* OUTSIDE THE TREE AND GONE AGAIN before the tests run: a bundle left beside the source is a second copy of the Worker. */
  const dir = mkdtempSync(join(tmpdir(), 'braindog-worker-'));
  try {
    const file = join(dir, 'index.mjs');
    writeFileSync(file, built.outputFiles[0]!.text);
    return (await import(pathToFileURL(file).href)) as Bundle;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * A Durable Object's `storage` over `node:sqlite`: `sql.exec`, `transactionSync` and the alarm, which is all `Record$` calls.
 *
 * `prepare` ON A SCRIPT RUNS ITS FIRST STATEMENT AND DROPS THE REST without a word, measured on Node 24.13, so a statement
 * that reads nothing and takes no parameters goes through `exec`, which runs all of it. A nested `transactionSync` is a
 * savepoint, as it is on workerd (`kernel-in-do.test.ts`).
 */
const objectStorage = () => {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  let alarm: number | null = null;
  const cursor = (rows: unknown[]) => ({ toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() });
  return {
    sql: {
      exec(text: string, ...params: never[]) {
        const statement = db.prepare(text);
        if (statement.columns().length > 0) return cursor(statement.all(...params));
        if (params.length === 0) db.exec(text);
        else statement.run(...params);
        return cursor([]);
      },
    },
    transactionSync<T>(fn: () => T): T {
      const point = `sp${depth++}`;
      db.exec(`SAVEPOINT ${point}`);
      try {
        const value = fn();
        db.exec(`RELEASE ${point}`);
        return value;
      } catch (e) {
        db.exec(`ROLLBACK TO ${point}`);
        db.exec(`RELEASE ${point}`);
        throw e;
      } finally {
        depth--;
      }
    },
    getAlarm: async () => alarm,
    setAlarm: async (at: number | Date) => void (alarm = Number(at)),
    deleteAlarm: async () => void (alarm = null),
  };
};

/** Workers AI's `run`, answering the pass-1 draft `slash-demo.test.ts` answers with, and counting every run. */
let aiRuns = 0;
/* THE ASK'S OWN SEARCH MAY EMBED ITS WORDS ONCE, on the background allowance: counted apart, so `aiRuns` is Slash's model. */
let aiEmbeds = 0;
const countedAi = {
  run: async (model: string) => {
    if (model === EMBED_MODEL) {
      aiEmbeds++;
      return { data: [] };
    }
    aiRuns++;
    const content = '{"registers":[],"where":null,"q":"open"}';
    return { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  },
};

/** One hosted record with a model configured and a read token of its own, and the Worker routing to it. */
const hostedRecord = async () => {
  const { default: worker, Record$ } = await bundled();
  /* THE INCLUDED MODEL OVER A COUNTED FAKE BINDING: the Worker names no endpoint of its own any more, and the locks held here are the door's, whichever model is behind it. */
  const env: Record<string, unknown> = { PUBLIC_HOST: HOST, AI: countedAi, SLASH_INCLUDED: 'yes', KEK: FAKE_KEK, INGRESS: { send: async () => {} } };
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

  /* THE TOKEN IS THE RECORD'S OWN, minted by the owner through the method a session reaches, so `bearerOf` resolves it
     through the object's real `verify` and `access` rather than through a double that answers yes. */
  const owner = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
  const mint = new Request(`https://${HOST}/api/createToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(owner) },
    body: JSON.stringify({ scope: 'read', label: 'cli' }),
  });
  const minted = (await (await object.fetch(mint)).json()) as { ok: boolean; value: { id: string; bearer: string } };
  assert.ok(minted.ok, `the record minted no token: ${JSON.stringify(minted)}`);
  return { worker, object, env, token: minted.value, owner, forwarded };
};

/** A POST to the ask carrying the app's own origin, which is the one header a client that is not a browser writes freely. */
const ask = (headers: Record<string, string>) =>
  new Request(`https://${HOST}/api/slash/read`, {
    method: 'POST',
    headers: { origin: `https://${HOST}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ question: 'Which tasks are open?' }),
  });

/** The model, answered here and counted, so a test can say that nothing was spent as well as what came back. Every call
    to it, and any `fetch` the Worker makes beside it, is one call. */
const withModel = async (run: () => Promise<Response>): Promise<{ status: number; body: Record<string, unknown>; calls: number; embeds: number }> => {
  const real = globalThis.fetch;
  let calls = 0;
  const from = aiRuns;
  const embedsFrom = aiEmbeds;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('{}', { status: 502 });
  }) as typeof fetch;
  try {
    const out = await run();
    return { status: out.status, body: (await out.json()) as Record<string, unknown>, calls: calls + aiRuns - from, embeds: aiEmbeds - embedsFrom };
  } finally {
    globalThis.fetch = real;
  }
};

test("A TOKEN THE RECORD KNOWS, WITH THE APP'S ORIGIN WRITTEN BY HAND, IS REFUSED AT THE ROUTER and the model is not called", async () => {
  const { worker, env, token, forwarded } = await hostedRecord();
  const out = await withModel(() => worker.fetch(ask({ authorization: `Bearer ${token.bearer}` }), env, { waitUntil: () => {} }));
  assert.equal(out.status, 403, `a token asked Slash and was answered ${out.status}: ${JSON.stringify(out.body)}`);
  const refusal = out.body['refusal'] as { code: string; at: string };
  assert.equal(refusal.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal.at, 'principal');
  assert.equal(out.calls + out.embeds, 0, 'the model was called for a token');
  /* THE BEARER WAS RESOLVED, SO THE TOKEN IS ONE THE RECORD KNOWS, and the ask itself never reached the object. */
  assert.deepEqual(forwarded, [], 'the router forwarded a token to the ask and left the refusal to the object');
});

test('AND THE OBJECT REFUSES A TOKEN CONTEXT ITSELF, for a router that forwards one anyway, while a person still gets through', async () => {
  const { object, token, owner } = await hostedRecord();
  /* WHAT `inward()` HANDS THE OBJECT for a bearer: the context in its header and no `authorization` at all, so the door's own
     check has nothing to find. The object is where the record decides who is asking, so it answers for itself. */
  const ctx = { principal: { kind: 'token', id: token.id, scope: 'read', person: 'p_owner', level: 'owner' } };
  const refused = await withModel(() => object.fetch(ask({ 'x-braindog-ctx': JSON.stringify(ctx) })));
  assert.equal(refused.status, 403, `a token context was answered ${refused.status}: ${JSON.stringify(refused.body)}`);
  assert.equal((refused.body['refusal'] as { code: string }).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refused.calls + refused.embeds, 0, 'the model was called for a token');

  /* A PERSON STILL GETS THROUGH, or the refusal above would be a door shut on everybody, and the fold ends on the keychain. */
  const asked = await withModel(() => object.fetch(ask({ 'x-braindog-ctx': JSON.stringify(owner) })));
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(asked.calls, 1);
  assert.deepEqual((asked.body['value'] as { read: unknown[] }).read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });
});
