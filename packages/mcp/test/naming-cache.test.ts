/**
 * The naming state held across messages (`named` in `rpc.ts`): each list's declaration, as `schema` answered the caller,
 * kept at the version the record says it stands at for that caller.
 *
 * WHAT IT COST. `tools` is built for every message, so the prefixes, ref fields, text fields and cards it reads from
 * `schema` died with each answer: measured on the seed through `handle`, every `list tasks` asked `schema` twice
 * (Tasks and Projects) before it said one name, the same two on every call of a session, and on the record each of
 * those reads parses every block declaration it holds.
 *
 * WHAT MUST HOLD, which is why this is a test of who is told what as much as of how often. A kept declaration is the
 * caller's own, read with her own context, and never handed to a context that writes out differently; a refused one
 * is never kept; a write that moves the record's version asks again; and nothing but `schema` is kept, so a name is
 * still read fresh for every answer (`names-cache.test.ts` holds that half).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import type { Result } from '@braindog/ports';

import type { McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const owner: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'naming-cache', cwd: '/Users/studio/Code/kiln-type' },
} as CallContext;

/** The seeded record behind a surface that counts every method it is asked, by name, and with which register. */
async function counted() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 21, 9)) });
  await installSeed(api.kernel);
  const asked: string[] = [];
  const surface = new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]) => {
        if (key !== 'heard' && key !== 'doorHeard' && key !== 'beat') {
          const register = key === 'schema' && typeof args[0] === 'object' && args[0] !== null ? (args[0] as { register?: string }).register : undefined;
          asked.push(register === undefined ? key : `${key}:${register}`);
        }
        return Reflect.apply(value, target, args) as unknown;
      };
    },
  }) as unknown as McpSurface<CallContext>;
  return { api, surface, asked, sql };
}

let n = 0;
/* A COPY OF THE CONTEXT PER MESSAGE, as every transport builds one, so nothing here leans on the object being the same. */
const call = async <C>(surface: McpSurface<C>, ctx: C, name: string, args: Record<string, unknown>) => {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, surface, { ...ctx })) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const out = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
  return { error: out.isError === true, value: out.structuredContent, text: out.content[0]!.text };
};
const schemas = (asked: readonly string[]) => asked.filter((m) => m.startsWith('schema:'));

test('A SESSION ASKS EACH LIST ITS DECLARATION ONCE, then only the version, and says the same names', async () => {
  const { surface, asked, sql } = await counted();
  const costs: string[][] = [];
  const texts: string[] = [];
  for (let i = 0; i < 4; i++) {
    asked.splice(0);
    const said = await call(surface, owner, 'list', { register: 'tasks', limit: 50 });
    assert.ok(!said.error, JSON.stringify(said.value));
    texts.push(said.text);
    costs.push([...asked]);
  }
  /* SEEN ONCE: as it always was, and no version asked for a cache that would never be used. */
  assert.ok(schemas(costs[0]!).length >= 2, `the first list asked ${costs[0]!.join(' ')}`);
  assert.equal(costs[0]!.includes('version'), false, 'a caller seen once was asked a version');
  /* THE SECOND KEEPS WHAT IT READS, and every one after asks the version alone. */
  assert.ok(costs[1]!.includes('version'));
  for (const cost of costs.slice(2)) {
    assert.deepEqual(schemas(cost), [], `a kept declaration was asked again: ${cost.join(' ')}`);
    assert.equal(cost.filter((m) => m === 'version').length, 1, `one version a message: ${cost.join(' ')}`);
  }
  for (const text of texts.slice(1)) assert.equal(text, texts[0], 'a kept declaration said a different line');
  sql.close();
});

test('A LIST DECLARED AGAIN IS READ AGAIN on the next message, and the answer says the new declaration', async () => {
  const { api, surface, asked, sql } = await counted();
  for (let i = 0; i < 3; i++) await call(surface, owner, 'schema', { register: 'tasks' });
  asked.splice(0);
  await call(surface, owner, 'schema', { register: 'tasks' });
  assert.deepEqual(schemas(asked), [], 'the warm session asked its declaration again');

  const tasks = api.kernel.declarations().find((d) => d.id === 'register.tasks')!;
  const body = JSON.parse(tasks.body) as { fields: unknown[] };
  const out = await api.kernel.install(
    [{ id: 'register.tasks', kind: 'register', body: { ...body, fields: [...body.fields, { id: 'glaze', type: 'text' }] } }] as never,
    { id: 'register.tasks', version: tasks.version },
    /* AS THE RECORD INSTALLS ONE, by somebody: that writes the line the version moves on. */
    { actor: 'p_seed' } as never,
  );
  assert.ok(out.ok, JSON.stringify(out));

  asked.splice(0);
  const after = await call(surface, owner, 'schema', { register: 'tasks' });
  assert.deepEqual(schemas(asked), ['schema:tasks'], 'a list declared again was answered from what was kept');
  assert.ok((after.value.fields as { id: string }[]).some((f) => f.id === 'glaze'), 'the new field is not in the answer');
  sql.close();
});

test('A WRITE THAT MOVES THE VERSION ASKS AGAIN, so a kept declaration is never older than the version it was read at', async () => {
  const { surface, asked, sql } = await counted();
  for (let i = 0; i < 3; i++) await call(surface, owner, 'list', { register: 'tasks', limit: 5 });
  asked.splice(0);
  await call(surface, owner, 'list', { register: 'tasks', limit: 5 });
  assert.deepEqual(schemas(asked), [], 'the warm session asked its declarations again');
  /* THE WRITE'S OWN ANSWER NAMES ITS ROW AFTER THE WRITE, so it is that message that meets the moved version. */
  const made = await call(surface, owner, 'create', { register: 'tasks', fields: { what: 'Fire the second kiln load' } });
  assert.ok(!made.error, JSON.stringify(made.value));
  assert.ok(schemas(asked).includes('schema:tasks'), `the version moved and nothing was asked again: ${asked.join(' ')}`);
  asked.splice(0);
  await call(surface, owner, 'list', { register: 'tasks', limit: 5 });
  assert.equal(schemas(asked).includes('schema:tasks'), false, `what was read at the new version was not kept: ${asked.join(' ')}`);
  sql.close();
});

test('ANOTHER CALLER IS NEVER ANSWERED FROM WHAT THE OWNER KEPT: a token that may not read Projects is told ids', async () => {
  const { surface, asked, sql } = await counted();
  for (let i = 0; i < 3; i++) await call(surface, owner, 'list', { register: 'tasks', limit: 500 });
  const appends = { ...owner, levels: { things: 'append' } } as CallContext;
  for (let i = 0; i < 3; i++) {
    asked.splice(0);
    const said = await call(surface, appends, 'list', { register: 'tasks', limit: 500 });
    /* ITS OWN READS, every time: the record refuses it Projects, and a refusal is never kept. */
    assert.ok(schemas(asked).includes('schema:things'), `the token's read of Projects came from somewhere else: ${asked.join(' ')}`);
    const things = (said.value.rows as { fields: Record<string, unknown> }[]).map((r) => r.fields.thing).filter((t) => t !== undefined);
    assert.ok(things.length > 0 && things.every((t) => typeof t === 'string' && !/^things#\d+$/.test(t)), `the token was told ${JSON.stringify([...new Set(things)])}`);
  }
  sql.close();
});

test('A REFUSED DECLARATION IS NEVER KEPT, and a context that cannot be written out keeps nothing', async () => {
  const { surface, calls } = stub({
    schema: async (args: { register: string }, ctx: Ctx): Promise<Result<unknown>> => {
      calls.push({ method: 'schema', args, ctx });
      return args.register === 'secret' ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } } : { ok: true, value: { fields: [], seq_prefix: 'OB' } };
    },
  });
  const asks = (register: string) => calls.filter((c) => c.method === 'schema' && (c.args as { register: string }).register === register).length;
  for (let i = 0; i < 4; i++) {
    await call(surface, { who: 'agent' }, 'schema', { register: 'secret' });
    await call(surface, { who: 'agent' }, 'schema', { register: 'obligations' });
  }
  assert.equal(asks('secret'), 4, 'a refusal was kept');
  /* THE CALLER WAS SEEN AT THE FIRST MESSAGE, so the first read of Obligations, at the second, is kept from then. */
  assert.equal(asks('obligations'), 1, 'a declaration the caller reads was asked again');

  /* A CONTEXT WITH A CYCLE CANNOT BE WRITTEN OUT, so it is no key, and every message asks as it always did. */
  const loop: Ctx & { self?: unknown } = { who: 'loop' };
  loop.self = loop;
  const before = asks('obligations');
  for (let i = 0; i < 3; i++) {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'schema', arguments: { register: 'obligations' } } }, surface, loop)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
  }
  assert.equal(asks('obligations') - before, 3);
});

test('A VERSION THE SURFACE CANNOT ANSWER KEEPS NOTHING, and a kept declaration is asked again after five minutes', async (t) => {
  let version: Result<{ version: number }> = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } };
  const { surface, calls } = stub({ version: async () => version });
  const asks = () => calls.filter((c) => c.method === 'schema').length;
  for (let i = 0; i < 3; i++) await call(surface, { who: 'refused' }, 'schema', { register: 'obligations' });
  assert.equal(asks(), 3, 'a declaration was kept against no version');

  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 21, 9) });
  version = { ok: true, value: { version: 7 } };
  const ctx = { who: 'timed' };
  for (let i = 0; i < 3; i++) await call(surface, ctx, 'schema', { register: 'obligations' });
  const warm = asks();
  await call(surface, ctx, 'schema', { register: 'obligations' });
  assert.equal(asks(), warm, 'a warm declaration was asked again');
  t.mock.timers.tick(5 * 60_000 + 1);
  await call(surface, ctx, 'schema', { register: 'obligations' });
  assert.equal(asks(), warm + 1, 'a declaration was kept past five minutes');
});
