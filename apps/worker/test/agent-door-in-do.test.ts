/**
 * The agent door's own signs on the Cloud: a session over `/mcp` moves hello, listed and called in `doorSigns`, and its
 * key's last tool call in `doorHealth`, on a record that lives in a Durable Object (AGT-B01 job 7).
 *
 * WHY THIS FILE EXISTS. The marks were held over a stub surface (`packages/mcp/test/heard.test.ts`) and over the record
 * on `node:sqlite` (`packages/record/test/door-heard.test.ts`). The agent door had no test on the Worker's own runtime,
 * and batch 43 moved the door's marks to `doorHeard`, a method no route names, which only the door holding the record
 * itself can reach (audit 38-39 findings 2 and 5). Whether workerd's door reaches it was never watched.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `shortcut-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, and a key
 * minted through `/api/createToken`. The agent speaks `/mcp` with the key as Claude Code does, and the owner reads the
 * signs back through `/api/doorSigns` and `/api/doorHealth` on the session a browser holds.
 *
 * ONE RECORD PER CASE, because the signs count every session on a record, and a case that read another's marks would
 * pass on them.
 *
 * RED FIRST, MEASURED over scratch bundles that rewrite one line before building, as `shortcut-in-do.test.ts` does.
 * `DOOR_MUTANT` picks which, and a rewrite that no longer finds its line throws:
 *   - `heard-only`: the door hands its marks to the routed `heard` and never to `doorHeard`, as before batch 43.
 *   - `heard-takes-all`: the routed `heard` stops refusing the door's own kinds.
 * Measured: `heard-only` turned the session case red (the record refuses hello, listed and called from `heard`, so
 * nothing moved), and `heard-takes-all` the refusal case. The four revisions and the tool list stay green under both,
 * as they should: neither mutant touches what the door answers.
 *
 * WHAT IT FOUND AT HEAD: one session over `/mcp` moves all three signs from 0 to 1 and its key's last tool call, and a
 * key posting the door's own kinds to `/api/heard` is refused FORBIDDEN at `kind` and moves nothing. Two keys on one
 * record within a minute counted as one session that made a call, until the Worker named its caller by the key's id.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as there.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client, type DoorHealth } from '../../../packages/client/src/index.ts';
import { TOOLS } from '../../../packages/mcp/src/index.ts';
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
const PROVISION_KEY = 'agent-door-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'agent-door-in-do-session-secret-not-a-secret-0123456789';

/** The scratch rewrites the red was measured with: see the header. Each is a whole line, found once or the build throws. */
const MUTANTS: Record<string, { file: RegExp; from: string; to: string }> = {
  'heard-only': {
    file: /[\\/]packages[\\/]mcp[\\/]src[\\/]rpc\.ts$/,
    from: "const leave = typeof s.doorHeard === 'function' ? s.doorHeard.bind(s) : typeof s.heard === 'function' ? s.heard.bind(s) : undefined;",
    to: "const leave = typeof s.heard === 'function' ? s.heard.bind(s) : undefined;",
  },
  'heard-takes-all': {
    file: /[\\/]packages[\\/]record[\\/]src[\\/]methods[\\/]door\.ts$/,
    from: "if (method === 'heard' && typeof a.kind === 'string' && (DOOR_ONLY as readonly string[]).includes(a.kind))",
    to: "if (method === 'heard' && typeof a.kind === 'string' && ([] as readonly string[]).includes(a.kind))",
  },
};
const mutant = process.env.DOOR_MUTANT;

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
/** Every answer of 500 or more this file was given, with its path and body. */
const fives: string[] = [];
let asked = 0;

/** `fetch`, with every answer counted and each one of 500 or more kept. */
async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  asked++;
  if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
  return res;
}

/** The signs as `doorSigns` answers them, the parts this file reads. */
type Signs = { hello: number; listed: number; called: number; calls: number; builds: { build: string; n: number }[]; hookSlowestMs: number | null; said: string };

/** One record, provisioned and claimed, with its owner's session and a way to mint the agent a key. */
type Held = { owner: Client; key(label: string): Promise<{ bearer: string; id: string }>; signs(): Promise<Signs>; lastTool(id: string): Promise<string | null> };

let made = 0;
async function record(): Promise<Held> {
  const slug = `door-${String(++made)}`;
  const provisioned = await counted(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug, email: `${slug}@example.test`, name: 'Door' }),
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
  /* THE KEY'S ROW IN doorHealth, the last tool call the record keeps for it (`noteTool`). */
  const health = async (): Promise<DoorHealth> => {
    const got = await owner.call<DoorHealth>('doorHealth', {});
    assert.ok(got.ok, `the owner could not read the door's health: ${JSON.stringify(got)}`);
    return got.value;
  };
  return {
    owner,
    key: async (label) => {
      const before = new Set((await health()).connections.map((c) => c.id));
      const minted = await owner.call<{ bearer: string }>('createToken', { scope: 'write', label });
      assert.ok(minted.ok, `the owner could not mint a key on the Worker: ${JSON.stringify(minted)}`);
      const id = (await health()).connections.find((c) => !before.has(c.id))?.id;
      assert.ok(id, 'the key minted is not among the connections doorHealth answers');
      return { bearer: minted.value.bearer, id };
    },
    signs: async () => {
      const got = await owner.call<Signs>('doorSigns', {});
      assert.ok(got.ok, `the owner could not read the door's signs: ${JSON.stringify(got)}`);
      return got.value;
    },
    lastTool: async (id) => (await health()).connections.find((c) => c.id === id)?.last_tool_at ?? null,
  };
}

let ids = 0;
/** One JSON-RPC message to `/mcp` on a key, under one protocol revision, with the headers that revision asks for. */
async function mcp(bearer: string, method: string, params: Record<string, unknown> = {}, version: string = VERSIONS[1]): Promise<{ status: number; body: Record<string, any> }> {
  const named = method === 'tools/call' ? String(params.name) : undefined;
  const res = await counted(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${bearer}`,
      'mcp-protocol-version': version,
      'mcp-method': method,
      ...(named === undefined ? {} : { 'mcp-name': named }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++ids, method, params }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** What Claude Code says when it says hello. */
const hello = (version: string) => ({ protocolVersion: version, capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.295' } });

before(async () => {
  const rewrite = mutant === undefined ? undefined : MUTANTS[mutant];
  if (mutant !== undefined && rewrite === undefined) throw new Error(`DOOR_MUTANT names no mutant: ${mutant}`);
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
              name: 'door-mutant',
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

test('INITIALIZE ANSWERS IN EACH OF THE FOUR REVISIONS, and only 2026-07-28 says resultType', async () => {
  const r = await record();
  const { bearer } = await r.key('MacBook');
  assert.equal(VERSIONS.length, 4, `the door speaks ${String(VERSIONS.length)} revisions now: ${VERSIONS.join(', ')}`);
  for (const version of VERSIONS) {
    const { status, body } = await mcp(bearer, 'initialize', hello(version), version);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.result?.protocolVersion, version, JSON.stringify(body));
    assert.equal(body.result?.resultType, version === VERSIONS[0] ? 'complete' : undefined, `${version}: ${JSON.stringify(body.result)}`);
  }
});

test('tools/list CARRIES resultType UNDER 2026-07-28 AND NAMES EVERY TOOL, the same as TOOLS', async () => {
  const r = await record();
  const { bearer } = await r.key('MacBook');
  const { status, body } = await mcp(bearer, 'tools/list', {}, VERSIONS[0]);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.result.resultType, 'complete');
  const names = (body.result.tools as { name: string }[]).map((t) => t.name);
  assert.deepEqual(names, TOOLS.map((t) => t.name));
});

test('ONE SESSION OVER /mcp MOVES HELLO, LISTED AND CALLED FROM 0 TO 1, and its key’s last tool call', async () => {
  const r = await record();
  const { bearer, id } = await r.key('MacBook');
  const was = await r.signs();
  assert.deepEqual([was.hello, was.listed, was.called], [0, 0, 0], 'a record nobody connected to already counted a session');
  assert.equal(await r.lastTool(id), null, 'a key that never called a tool has a last tool call');

  assert.equal((await mcp(bearer, 'initialize', hello(VERSIONS[1]))).status, 200);
  assert.equal((await mcp(bearer, 'tools/list')).status, 200);
  const context = await mcp(bearer, 'tools/call', { name: 'context', arguments: {} });
  assert.equal(context.status, 200, JSON.stringify(context.body));
  assert.notEqual(context.body.result?.isError, true, JSON.stringify(context.body));

  const now = await r.signs();
  assert.deepEqual([now.hello, now.listed, now.called], [1, 1, 1], `the signs read: ${now.said}`);
  assert.ok(now.calls >= 1, JSON.stringify(now));
  const last = await r.lastTool(id);
  assert.ok(last !== null && Date.now() - Date.parse(last) < 60_000, `the key's last tool call did not move: ${String(last)}`);
});

test('A CLIENT POSTING { kind: "called" } TO /api/heard IS REFUSED AND MOVES NOTHING, and a hook mark is kept', async () => {
  const r = await record();
  const { bearer, id } = await r.key('MacBook');
  const post = (mark: object) =>
    counted(`${base}/api/heard`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(mark) });

  /* EACH OF THE DOOR'S OWN KINDS, in the one sentence the record refuses them with. */
  for (const kind of ['called', 'hello', 'listed', 'internal']) {
    const res = await post({ kind, n: 5 });
    const body = (await res.json()) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
    assert.equal(body.ok, false, `${kind} was kept from a key: ${JSON.stringify(body)}`);
    assert.equal(body.refusal?.code, 'FORBIDDEN', JSON.stringify(body));
    assert.equal(body.refusal?.at, 'kind', JSON.stringify(body));
    assert.equal(body.refusal?.fix, `The agent door marks ${kind} itself when a session reaches it, so heard takes only hook.`);
    assert.ok(res.status >= 400 && res.status < 500, `${kind}: ${String(res.status)}`);
  }
  const after = await r.signs();
  assert.deepEqual([after.hello, after.listed, after.called, after.calls], [0, 0, 0, 0], `a refused mark moved a sign: ${after.said}`);
  assert.equal(await r.lastTool(id), null, 'a refused called moved the key’s last tool call');

  /* AND THE ROUTE IS THERE: the one mark a key posts itself is kept, so the refusals above are about the kind. */
  const hook = await post({ kind: 'hook', ms: 420 });
  assert.equal(hook.status, 200, await hook.clone().text());
  assert.equal((await r.signs()).hookSlowestMs, 420);
});

/*
 * TODO UNTIL THE DOOR KNOWS ITS CALLERS APART ON THE WORKER. `serveMcp` (`packages/mcp/src/http.ts`) keys the minute
 * between `called` marks on a hash of the `authorization` header, and the Worker's `inward()` (`src/route.ts`) deletes
 * that header before the record's `/mcp` sees the request. So every key on a record is one caller: the second key's
 * first call in the minute is held for a mark that never comes, its session is not counted and its `last_tool_at` does
 * not move, and `doorHealth`'s `delivered` sign reads it as a key that opened a run and made no call. Measured: "Made a
 * call: 1" for two keys. Keyed by the caller's token instead (a scratch rewrite of `callerOf` to read the principal from
 * `x-braindog-ctx`), this case went green. It waits on `serveMcp` taking a `caller` from its host and the Worker passing
 * the key's id (this batch's report, "blocked").
 */
test('TWO KEYS IN ONE MINUTE ARE TWO SESSIONS THAT MADE A CALL, and each key’s last tool call moves', async () => {
  /* WHAT HIS RECORD HAS EVERY MORNING: two machines, each with its own key, starting within the same minute. */
  const r = await record();
  const mac = await r.key('MacBook');
  const pc = await r.key('Windows PC');
  for (const k of [mac, pc]) assert.equal((await mcp(k.bearer, 'tools/call', { name: 'context', arguments: {} })).status, 200);
  const now = await r.signs();
  assert.equal(now.called, 2, `the signs read: ${now.said}`);
  for (const k of [mac, pc]) assert.notEqual(await r.lastTool(k.id), null, `a key that called a tool has no last tool call`);
});

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  /* AND IT WAS ASKED SOMETHING. Each record is about six requests before its case asks anything. */
  assert.ok(asked > 30, `${String(asked)} requests`);
  assert.deepEqual(fives, []);
});
