/**
 * The Cloud and a self-host answer the same (HD.132: "product must answer the same wherever run").
 *
 * FORTY CALLS, GOOD AND REFUSED, sent in the same order to the Worker as it ships (`apps/worker/test/cloud-harness.ts`:
 * `src/index.ts` bundled, a real Directory, real record objects) and to the self-host server started in this process
 * (`apps/selfhost/src/server.ts`), each record made bare and given one list, a figure and a page by the same calls. For
 * every call the status, the refusal's code and the SHAPE of the body are equal: its keys, recursively, and each value's
 * type, never the values, since an id, a clock or a key differs by design and a key that one host answers and the other
 * drops does not.
 *
 * BOTH APPS ARE IMPORTED BY RELATIVE PATH, as the packs' tests import packages: neither is a dependency of this one, and
 * this test is the one place that holds the two side by side.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import { cloud } from '../../../apps/worker/test/cloud-harness.ts';
import { start } from '../../../apps/selfhost/src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HPA';
const SLUG = 'parity-studio';
const OWNER = PEOPLE[0]!;
const WHAT = `Invoice ${PROJECTS[0]}`;

/** One list with a required field and a choice, declared on both records by the same call. */
const TASKS = {
  register: 'tasks',
  name: 'Tasks',
  title: 'what',
  search: ['what'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'done'] },
  ],
  state: 'state',
  done: ['done'],
};

/** A figure over that list and a page that says it, so `figures`, `metric`, `pages` and `page` answer something. */
const OPEN = {
  metric: 'open-tasks',
  name: 'Open tasks',
  source: 'register.tasks',
  where: 'state is open',
  value: { count: 'id' },
  format: 'int',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};
const DESK = {
  page: 'desk',
  title: 'Desk',
  blocks: [
    { kind: 'note', lead: true, span: 12, body: '{{open-tasks}} tasks are open.' },
    { kind: 'table', span: 12, source: 'register.tasks', empty: 'No tasks yet.' },
  ],
};

type Key = 'owner' | 'reader' | 'none' | 'wrong';
/** One call: the status the Cloud answers it with (so a call means what its name says), a path under `/api`, a body (a value is sent as JSON, a string as it is), and whose key goes with it. */
type Call = { name: string; want: number; path: string; body?: unknown; key?: Key };
type Answer = { status: number; body: unknown };
/** `own` is the owner's own hand on each host: a signed-in session on the Cloud, the owner in process on a self-host. */
type Host = { own(method: string, args: object): Promise<unknown>; send(call: Call): Promise<Answer>; close(): Promise<void> };

const sent = (call: Call): RequestInit => {
  if (call.body === undefined) return { method: 'GET' };
  return { method: 'POST', body: typeof call.body === 'string' ? call.body : JSON.stringify(call.body) };
};

const answered = async (res: Response): Promise<Answer> => {
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, body: `(not JSON) ${text.slice(0, 80)}` };
  }
};

/** Obviously not a real key: the self-host's own, which no call below sends. */
const SERVER_KEY = 'fake-server-key-for-parity-tests';

/**
 * THE DIFFERENCES THAT ARE TRUE TODAY, by call name, each with the change that ends it. Kept as short as the truth: the
 * test is red on a difference not held here, and on a held one that has stopped differing.
 */
const HELD: Readonly<Record<string, string>> = {};

/** A bearer that looks like one and opens nothing. */
const wrongKey = `${REC}.not-a-key-anyone-was-given-0000000000000`;

/** The Cloud: a record made as `provision` makes one, its owner signed in, and two keys minted on that session. */
async function cloudHost(): Promise<Host> {
  const c = await cloud();
  await c.provision(REC, SLUG, OWNER.email);
  const cookie = await c.signIn(OWNER.email);
  const mint = async (scope: string, label: string): Promise<string> => {
    const out = (await (await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope, label }) })).json()) as {
      value?: { bearer?: string };
    };
    assert.ok(out.value?.bearer, `the Cloud minted no ${scope} key: ${JSON.stringify(out)}`);
    return out.value.bearer;
  };
  const keys: Record<Key, string | undefined> = { owner: await mint('write', 'Studio laptop'), reader: await mint('read', 'Studio phone'), none: undefined, wrong: wrongKey };
  return {
    own: async (method, args) => (await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(args) })).json(),
    send: async (call) => {
      const bearer = keys[call.key ?? 'owner'];
      return answered(await c.ask(call.path, { ...sent(call), ...(bearer === undefined ? {} : { bearer }) }));
    },
    close: async () => c.settle(),
  };
}

/** The self-host: the server on a socket, a record made through its kernel, and two keys minted for its owner. */
async function selfHost(): Promise<Host> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-parity-'));
  /* WITH A SERVER KEY, as a self-host others reach runs. With none it is open mode, one person on one machine, where
     no credential is asked for by design (`contextFor`), and "no key at all" would be a 200 there and nowhere else. */
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, host: '127.0.0.1', token: SERVER_KEY, pollMs: 0, limits: null });
  const port = (running.server.address() as { port: number }).port;
  const made = running.api.kernel.createRecord({ id: REC, slug: SLUG, name: SLUG, tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok(made.ok, JSON.stringify(made));
  const owner = { principal: { kind: 'person' as const, id: 'p_1', level: 'owner' as const } };
  const mint = async (scope: 'read' | 'write', label: string): Promise<string> => {
    const out = (await running.api.createToken({ scope, label }, owner)) as { ok: boolean; value?: { bearer?: string } };
    assert.ok(out.value?.bearer, `the self-host minted no ${scope} key: ${JSON.stringify(out)}`);
    return out.value.bearer;
  };
  const keys: Record<Key, string | undefined> = { owner: await mint('write', 'Studio laptop'), reader: await mint('read', 'Studio phone'), none: undefined, wrong: wrongKey };
  return {
    own: async (method, args) => (running.api as unknown as Record<string, (a: object, c: object) => Promise<unknown>>)[method]!(args, owner),
    send: async (call) => {
      const bearer = keys[call.key ?? 'owner'];
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (bearer !== undefined) headers['authorization'] = `Bearer ${bearer}`;
      return answered(await fetch(`http://127.0.0.1:${port}${call.path}`, { ...sent(call), headers }));
    },
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A body's shape: every key, recursively and sorted, and each value's type. An array is the set of its items' shapes,
 * so two lists of different lengths with the same kind of item are the same shape.
 */
export function shapeOf(value: unknown): unknown {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const seen = new Map<string, unknown>();
    for (const item of value) {
      const shape = shapeOf(item);
      seen.set(JSON.stringify(shape), shape);
    }
    return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, s]) => s);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, shapeOf(o[k])]));
  }
  return typeof value;
}

const codeOf = (body: unknown): string | null =>
  (body as { refusal?: { code?: string } } | null)?.refusal?.code ?? null;

/**
 * THE FORTY, IN ORDER, sent with the owner's key unless a call says otherwise. `tasks#1` is the owner's row at version
 * 2, so an update at version 1 is stale. A key's good write is asked as a question first (the ladder), on both hosts.
 */
const CALLS: readonly Call[] = [
  { name: 'a key declaring a list', want: 403, path: '/api/setDeclaration', body: { body: { ...TASKS, register: 'errands', name: 'Errands' } } },
  { name: 'boot', want: 200, path: '/api/boot' },
  { name: 'whoami', want: 200, path: '/api/whoami' },
  { name: 'version', want: 200, path: '/api/version' },
  { name: 'schema of a list', want: 200, path: '/api/schema?register=tasks' },
  { name: 'schema of no list', want: 422, path: '/api/schema?register=errands' },
  { name: 'a create', want: 200, path: '/api/create', body: { register: 'tasks', fields: { what: WHAT, state: 'open' } } },
  { name: 'a create missing a required field', want: 422, path: '/api/create', body: { register: 'tasks', fields: { state: 'open' } } },
  { name: 'a create with an unknown field', want: 422, path: '/api/create', body: { register: 'tasks', fields: { what: WHAT, colour: 'teal' } } },
  { name: 'a create with a bad choice', want: 422, path: '/api/create', body: { register: 'tasks', fields: { what: WHAT, state: 'shelved' } } },
  { name: 'a create on no list', want: 422, path: '/api/create', body: { register: 'errands', fields: { what: WHAT } } },
  { name: "a list's rows", want: 200, path: '/api/list?register=tasks' },
  { name: 'one row', want: 200, path: '/api/get?register=tasks&seq=1' },
  { name: 'a row that is not there', want: 200, path: '/api/get?register=tasks&seq=99' },
  { name: 'a row number that is not whole', want: 422, path: '/api/get?register=tasks&seq=1.5' },
  { name: 'an update', want: 200, path: '/api/update', body: { register: 'tasks', seq: 1, version: 2, patch: { state: 'done' } } },
  { name: 'an update on a stale version', want: 409, path: '/api/update', body: { register: 'tasks', seq: 1, version: 1, patch: { what: `${WHAT}, again` } } },
  { name: 'an update with an unknown field', want: 422, path: '/api/update', body: { register: 'tasks', seq: 1, patch: { colour: 'teal' } } },
  { name: 'an update on a row that is not there', want: 422, path: '/api/update', body: { register: 'tasks', seq: 99, patch: { state: 'done' } } },
  { name: "a row's history", want: 200, path: '/api/history?register=tasks&seq=1' },
  { name: 'a count by a field', want: 200, path: '/api/countBy?register=tasks&by=state' },
  { name: 'search', want: 200, path: `/api/search?q=${encodeURIComponent(PROJECTS[0])}` },
  { name: 'search with a limit that is not whole', want: 422, path: '/api/search?q=invoice&limit=1.5' },
  { name: 'a note against a row', want: 200, path: '/api/log', body: { register: 'tasks', seq: 1, note: 'Sent on Tuesday.' } },
  { name: 'what changed', want: 200, path: '/api/recentHistory?limit=5' },
  { name: 'the pages', want: 200, path: '/api/pages' },
  { name: 'a page', want: 200, path: '/api/page?slug=desk' },
  { name: 'a page that is not there', want: 404, path: '/api/page?slug=nowhere' },
  { name: 'the figures', want: 200, path: '/api/figures' },
  { name: 'a figure', want: 200, path: '/api/metric?metric=open-tasks' },
  { name: 'a figure that is not there', want: 422, path: '/api/metric?metric=nothing-counted' },
  { name: 'export', want: 403, path: '/api/export', body: {} },
  { name: 'an unknown method', want: 404, path: '/api/teleport' },
  { name: 'a body that is not JSON', want: 400, path: '/api/create', body: '{"register": "tasks", ' },
  { name: 'a write sent as a read', want: 405, path: '/api/create?register=tasks' },
  { name: 'a read key reading', want: 200, path: '/api/list?register=tasks', key: 'reader' },
  { name: 'a token outside its scope', want: 403, path: '/api/create', body: { register: 'tasks', fields: { what: WHAT } }, key: 'reader' },
  { name: 'a read key minting a key', want: 403, path: '/api/createToken', body: { scope: 'write', label: 'Spare' }, key: 'reader' },
  { name: 'no key at all', want: 401, path: '/api/boot', key: 'none' },
  { name: 'a key nobody was given', want: 401, path: '/api/boot', key: 'wrong' },
];

/** One answer as the comparison reads it: status, refusal code and shape. */
const seen = (a: Answer) => ({ status: a.status, code: codeOf(a.body), shape: shapeOf(a.body) });

test('THE CLOUD AND A SELF-HOST ANSWER FORTY CALLS THE SAME: status, refusal code and the shape of the body', async () => {
  assert.equal(CALLS.length, 40);
  assert.equal(new Set(CALLS.map((c) => c.name)).size, CALLS.length, 'two calls share a name');
  for (const name of Object.keys(HELD)) assert.ok(CALLS.some((c) => c.name === name), `HELD names no call: ${name}`);
  const hosts = { cloud: await cloudHost(), selfhost: await selfHost() };
  try {
    /* THE ONE LIST, ITS FIGURE, ITS PAGE AND ITS FIRST ROW, by each owner's own hand: a key may not change what a record
       is (the first call), and a new key's write asks before it lands (the ladder), so `tasks#1` is the owner's, edited
       once to version 2. */
    for (const [name, host] of Object.entries(hosts)) {
      for (const [method, args] of [
        ['setDeclaration', { body: TASKS }],
        ['setDeclaration', { body: OPEN }],
        ['setDeclaration', { body: DESK }],
        ['create', { register: 'tasks', fields: { what: WHAT, state: 'open' } }],
        ['update', { register: 'tasks', seq: 1, version: 1, patch: { what: `${WHAT}, sent` } }],
      ] as const) {
        const out = (await host.own(method, args)) as { ok?: boolean; value?: { asked?: unknown } };
        assert.ok(out.ok === true && out.value?.asked === undefined, `${name} did not take ${method}: ${JSON.stringify(out)}`);
      }
    }
    const differ: string[] = [];
    const healed: string[] = [];
    let refused = 0;
    for (const call of CALLS) {
      const a = seen(await hosts.cloud.send(call));
      const b = seen(await hosts.selfhost.send(call));
      if (a.status !== call.want) differ.push(`${call.name} (${call.path}): the Cloud answered ${a.status}, not ${call.want}`);
      if (a.status >= 400) refused++;
      const same = JSON.stringify(a) === JSON.stringify(b);
      if (Object.hasOwn(HELD, call.name)) {
        if (same) healed.push(call.name);
      } else if (!same) differ.push(`${call.name} (${call.path}):\n  Cloud     ${JSON.stringify(a)}\n  self-host ${JSON.stringify(b)}`);
    }
    /* AND THE OWNER'S OWN EXPORT, which a key is refused (`export` above): the file each host hands its owner has the
       same shape, read after the forty so it holds what they wrote. */
    const exported = await Promise.all([hosts.cloud.own('export', {}), hosts.selfhost.own('export', {})]);
    const [ea, eb] = exported.map((out) => shapeOf(JSON.parse(JSON.stringify(out))));
    assert.equal((exported[0] as { ok?: boolean }).ok, true, `the Cloud's export: ${JSON.stringify(exported[0]).slice(0, 300)}`);
    if (JSON.stringify(ea) !== JSON.stringify(eb)) differ.push(`the owner's export:\n  Cloud     ${JSON.stringify(ea)}\n  self-host ${JSON.stringify(eb)}`);
    assert.deepEqual(differ, [], `the hosts answer differently:\n${differ.join('\n')}`);
    assert.deepEqual(healed, [], `held differences that are gone, so take them off HELD: ${healed.join(', ')}`);
    /* GOOD AND REFUSED: a run where every call was refused would be equal and prove nothing about the record. */
    assert.ok(refused >= 15 && refused <= 25, `${refused} of the forty were refused`);
  } finally {
    await hosts.cloud.close();
    await hosts.selfhost.close();
  }
});
