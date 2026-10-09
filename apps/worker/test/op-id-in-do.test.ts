/**
 * A write sent twice with one operation id is one entry, on a record that lives in a Durable Object (AGT-B05 job 4).
 *
 * WHY THIS FILE EXISTS. The command line now sends a create or an update once more, with the same `op_id`, when the
 * host's answer was lost (`apps/cli/src/bridge.ts`, held by `apps/cli/test/op-id.test.ts` over a self-host). The replay
 * itself is the kernel's (`opId` in `packages/kernel/src/index.ts`), held over `node:sqlite`. Nobody had watched workerd
 * answer the second sending, through `/api` or through the agent door, and count what the record holds after.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `agent-door-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, a Tasks
 * list added the way the canvas adds one (a change proposed and accepted), and a key minted through `/api/createToken`
 * for the agent, which speaks `/mcp` as Claude Code does.
 *
 * ONE RECORD PER CASE, because each case counts the tasks on its record.
 *
 * RED FIRST, MEASURED over a scratch bundle that rewrites one line before building, as there. `OP_MUTANT` picks it:
 *   - `no-replay`: the kernel never finds the id it was given (`already` read as nothing), so a second sending is a
 *     second write.
 * Measured: `no-replay` turned the `/api`, agent-door and update cases red (the second sending wrote again, or met the
 * unique index on `op_id` and answered 500), and the case counting 500s. The two-ids case stayed green, as it should,
 * and so did the case of an agent that still asks: what holds that one is the record asking nobody the same question
 * twice, not the id.
 *
 * WHAT IT FOUND AT HEAD: the replay holds in workerd through both doors. And the id does not ride a filed question: a
 * create sent once more AFTER the person accepted the first one files a second question, and accepting that one is a
 * second task. The command line's retry is sent at once, before anybody could accept, so this file does not pin it;
 * carrying `op_id` into the filed write is the record's to do (`packages/record/src/index.ts`, `create`'s filing).
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as there.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';
import { VERSIONS } from '../../../packages/mcp/src/rpc.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
/* NOT SECRETS. They guard a Worker that lives in this process for a second or two. */
const PROVISION_KEY = 'op-id-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'op-id-in-do-session-secret-not-a-secret-0123456789';

const TASKS = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] };

/** The scratch rewrite the red was measured with: see the header. A whole line, found once or the build throws. */
const MUTANTS: Record<string, { file: RegExp; from: string; to: string }> = {
  'no-replay': {
    file: /[\\/]packages[\\/]kernel[\\/]src[\\/]index\.ts$/,
    from: "const already = sql.one<{ target: string }>('SELECT target FROM event WHERE op_id = ?', w.opId);",
    to: 'const already = undefined as { target: string } | undefined;',
  },
};
const mutant = process.env.OP_MUTANT;

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
/** Every answer of 500 or more this file was given, with its path and body. */
const fives: string[] = [];

/** `fetch`, with every answer of 500 or more kept. */
async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
  return res;
}

type Entry = { seq: number; version: number; fields: Record<string, unknown> };

/** One record, provisioned and claimed, holding a Tasks list, with its owner's session and a key for the agent. */
let made = 0;
async function record(): Promise<{ owner: Client; bearer: string; tasks(): Promise<Entry[]> }> {
  const slug = `op-${String(++made)}`;
  const provisioned = await counted(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug, email: `${slug}@example.test`, name: 'Op' }),
  });
  const out = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(out));
  const redeemed = await counted(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: out.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  const cookie = set.split(';')[0]!;
  const owner = createClient({
    base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return counted(input, { ...init, headers: sent });
    },
  });
  /* THE LIST IS ADDED AS THE CANVAS ADDS ONE: a change proposed, and accepted by the owner. */
  const filed = await owner.call<{ id: string }>('propose', {
    question: 'Add a list of tasks?',
    body_kind: 'change',
    body: { declaration_id: 'register.tasks', to: { id: 'register.tasks', kind: 'register', body: TASKS }, from_version: 0 },
  });
  assert.ok(filed.ok, `the Tasks list could not be offered on the Worker: ${JSON.stringify(filed)}`);
  const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the test counts tasks' } });
  assert.ok(accepted.ok, `the Tasks list would not install on the Worker: ${JSON.stringify(accepted)}`);
  const minted = await owner.call<{ bearer: string }>('createToken', { scope: 'write', label: 'MacBook' });
  assert.ok(minted.ok, `the owner could not mint a key on the Worker: ${JSON.stringify(minted)}`);
  const tasks = async (): Promise<Entry[]> => {
    const got = await owner.call<{ rows: Entry[] }>('list', { register: 'tasks', limit: 50 });
    assert.ok(got.ok, `the owner could not list the tasks: ${JSON.stringify(got)}`);
    return got.value.rows;
  };
  return { owner, bearer: minted.value.bearer, tasks };
}

let ids = 0;
/** One `tools/call` to `/mcp` on a key, with the headers the revision asks for, as the command line's bridge sends it. */
async function tool(bearer: string, name: string, args: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> {
  const res = await counted(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${bearer}`,
      'mcp-protocol-version': VERSIONS[1],
      'mcp-method': 'tools/call',
      'mcp-name': name,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++ids, method: 'tools/call', params: { name, arguments: args } }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

before(async () => {
  const rewrite = mutant === undefined ? undefined : MUTANTS[mutant];
  if (mutant !== undefined && rewrite === undefined) throw new Error(`OP_MUTANT names no mutant: ${mutant}`);
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
    plugins:
      rewrite === undefined
        ? []
        : [
            {
              name: 'op-mutant',
              setup(b: { onLoad: Function }) {
                b.onLoad({ filter: rewrite.file }, (args: { path: string }) => {
                  const text = readFileSync(args.path, 'utf8');
                  if (text.split(rewrite.from).length !== 2) throw new Error(`the ${String(mutant)} line is not in ${args.path} exactly once`);
                  return { contents: text.replace(rewrite.from, rewrite.to), loader: 'ts' };
                });
              },
            },
          ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so the system picks one: a fixed port would collide with `wrangler dev` or a gate already listening. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      /* `wrangler.jsonc`'s own date and flags, because a different date is a different runtime. */
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Record$', useSQLite: true }, DIRECTORY: { className: 'Directory$', useSQLite: true } },
      queueProducers: { INGRESS: 'braindog-ingress' },
      bindings: { PUBLIC_HOST: HOST, SESSION_SECRET, PROVISION_KEY, PROVISION_WITHOUT_KEYS: 'yes', BRAINDOG_BUILD: '' },
    }),
  );
  base = (await mf.ready).origin;
});

after(async () => {
  await mf?.dispose();
});

test('TWO CREATES WITH ONE op_id OVER /api ARE ONE TASK, and the second answers the first one’s number', async () => {
  const r = await record();
  const first = await r.owner.call<Entry>('create', { register: 'tasks', fields: { what: 'Buy stamps' }, op_id: 'op-buy-stamps' });
  assert.ok(first.ok, JSON.stringify(first));
  const again = await r.owner.call<Entry>('create', { register: 'tasks', fields: { what: 'Buy stamps' }, op_id: 'op-buy-stamps' });
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(again.value.seq, first.value.seq, 'the second sending answered another task');
  const held = await r.tasks();
  assert.equal(held.length, 1, `one "add a task" sent twice made ${String(held.length)} tasks`);
});

/**
 * The agent's key climbed to "Let it, and tell me" for adding tasks, as a person climbs it: ten tasks it asked to add,
 * each accepted as it was, then a yes to the offer the tenth brings. Before that every create it sends is a question.
 */
async function climbed(r: { owner: Client; bearer: string }): Promise<void> {
  for (let n = 1; n <= 10; n++) {
    const { body } = await tool(r.bearer, 'create', { register: 'tasks', fields: { what: `Warm up ${String(n)}` }, op_id: `op-warm-${String(n)}` });
    const filed = body.result?.structuredContent?.filed?.id as string | undefined;
    assert.ok(filed, `warm-up ${String(n)} was not filed as a question: ${JSON.stringify(body)}`);
    assert.ok((await r.owner.call('decide', { id: filed, decide: { option: 'accept', reason: 'kept as it was' } })).ok);
  }
  const open = await r.owner.call<{ id: string; question: string }[]>('governance', { status: 'open' });
  assert.ok(open.ok, JSON.stringify(open));
  const offer = open.value.find((q) => q.question.includes('without asking'));
  assert.ok(offer, `ten kept tasks brought no offer to climb: ${JSON.stringify(open.value)}`);
  assert.ok((await r.owner.call('decide', { id: offer.id, decide: { option: 'yes', reason: 'it has earned it' } })).ok);
}

test('TWO CREATES WITH ONE op_id THROUGH THE AGENT DOOR ARE ONE TASK, as the command line retries one', async () => {
  const r = await record();
  await climbed(r);
  const before = (await r.tasks()).length;
  const args = { register: 'tasks', fields: { what: 'Buy stamps' }, op_id: 'op_5f0c2a9e-1b7d-4c3e-9a51-2d8e6f4b7c10' };
  const said: string[] = [];
  for (const n of [1, 2]) {
    const { status, body } = await tool(r.bearer, 'create', args);
    assert.equal(status, 200, JSON.stringify(body));
    assert.notEqual(body.result?.isError, true, `sending ${String(n)} was refused: ${JSON.stringify(body)}`);
    assert.equal(body.result?.structuredContent?.filed, undefined, `sending ${String(n)} was filed, not written: ${JSON.stringify(body)}`);
    said.push(JSON.stringify(body.result?.structuredContent?.spoken));
  }
  const held = await r.tasks();
  assert.equal(held.length - before, 1, `the agent door wrote ${String(held.length - before)} tasks for one operation`);
  assert.equal(said[1], said[0], 'the second sending answered another task');
});

test('TWO CREATES WITH ONE op_id WHILE THE AGENT STILL ASKS ARE ONE QUESTION, and one task once it is accepted', async () => {
  const r = await record();
  const args = { register: 'tasks', fields: { what: 'Buy stamps' }, op_id: 'op-asked' };
  const filed: string[] = [];
  for (const n of [1, 2]) {
    const { body } = await tool(r.bearer, 'create', args);
    const id = body.result?.structuredContent?.filed?.id as string | undefined;
    assert.ok(id, `sending ${String(n)} was not filed: ${JSON.stringify(body)}`);
    filed.push(id);
  }
  assert.equal(filed[1], filed[0], 'the second sending filed a second question');
  assert.ok((await r.owner.call('decide', { id: filed[0], decide: { option: 'accept', reason: 'yes' } })).ok);
  assert.equal((await r.tasks()).length, 1);
});

test('AN UPDATE SENT TWICE WITH ONE op_id MOVES THE VERSION ONCE', async () => {
  const r = await record();
  const made1 = await r.owner.call<Entry>('create', { register: 'tasks', fields: { what: 'Buy stamps' } });
  assert.ok(made1.ok, JSON.stringify(made1));
  for (const n of [1, 2]) {
    const changed = await r.owner.call<Entry>('update', { register: 'tasks', seq: made1.value.seq, patch: { what: 'Buy two stamps' }, op_id: 'op-two-stamps' });
    assert.ok(changed.ok, `sending ${String(n)}: ${JSON.stringify(changed)}`);
  }
  const held = await r.tasks();
  assert.equal(held.length, 1);
  assert.equal(held[0]!.version, made1.value.version + 1, 'the update sent twice moved the version twice');
});

/**
 * THE RETRY CARRIES THE VERSION THE FIRST SENDING READ, and the first sending moved it, so a record that compared the
 * version before it looked for the id would answer the retry VERSION_STALE: the agent told its write was lost when it
 * landed. Without an id the same second sending is stale, which is what shows the version is being compared at all.
 */
test('AN UPDATE SENT TWICE WITH ONE op_id AND A VERSION IS NOT ANSWERED STALE, and one without an id is', async () => {
  const r = await record();
  const made1 = await r.owner.call<Entry>('create', { register: 'tasks', fields: { what: 'Buy stamps' } });
  assert.ok(made1.ok, JSON.stringify(made1));
  const args = { register: 'tasks', seq: made1.value.seq, patch: { what: 'Buy two stamps' }, version: made1.value.version, op_id: 'op-stale' };
  for (const n of [1, 2]) {
    const changed = await r.owner.call<Entry>('update', args);
    assert.ok(changed.ok, `sending ${String(n)} was not answered as written: ${JSON.stringify(changed)}`);
    assert.equal(changed.value.version, made1.value.version + 1, `sending ${String(n)} answered another version`);
  }
  const { op_id: _, ...bare } = { ...args, patch: { what: 'Buy three stamps' } };
  const stale = await r.owner.call<Entry>('update', bare);
  assert.equal(stale.ok, false, `an update at a version already moved past was written: ${JSON.stringify(stale)}`);
  const held = await r.tasks();
  assert.equal(held[0]!.version, made1.value.version + 1);
  assert.equal(held[0]!.fields.what, 'Buy two stamps');
});

test('TWO CREATES WITH TWO op_ids ARE TWO TASKS, so the count above is the replay and not a list that holds one', async () => {
  const r = await record();
  for (const op of ['op-a', 'op-b']) assert.ok((await r.owner.call('create', { register: 'tasks', fields: { what: 'Buy stamps' }, op_id: op })).ok);
  assert.equal((await r.tasks()).length, 2);
});

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  assert.deepEqual(fives, []);
});
