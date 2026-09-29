/**
 * What a script can reach from inside the sandbox, asked from inside the sandbox.
 *
 * `node:vm` was refused for the sandbox because `this.constructor.constructor('return
 * process')()` walks out of it in one line. These are that line and its siblings, run in QuickJS,
 * with the answer carried out through `ctx.write` so the assertion reads what the script saw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

const decl = (source: string): ScriptDecl => ({
  id: 'probe',
  version: 1,
  egress: ['https://api.gold.example'],
  keys: [],
  reads: [],
  writes: ['probe'],
  source,
});

const host = (): CtxHost & { calls: number } => {
  const h = {
    calls: 0,
    fetch: async () => {
      h.calls += 1;
      return { status: 200, headers: {}, body: '' };
    },
    now: () => '2026-09-22T10:00:00Z',
    tz: 'UTC',
    input: null,
  };
  return h;
};

/** Run a probe that reports through one write, and return what it reported. */
const seen = async (body: string): Promise<unknown> => {
  const a = await runInQuickJs(decl(`export default async function run(ctx) { ctx.write('probe', await (async () => { ${body} })()) }`), host());
  assert.ok('writes' in a, JSON.stringify(a));
  const [first] = a.writes;
  assert.ok(first !== undefined && first.op === 'create');
  return first.fields;
};

test('process, require and the bare fetch are not there', async () => {
  assert.deepEqual(
    await seen(`return {
      process: typeof globalThis.process,
      require: typeof require,
      fetch: typeof fetch,
      XMLHttpRequest: typeof XMLHttpRequest,
      WebSocket: typeof WebSocket,
      std: typeof std,
      os: typeof os,
    }`),
    { process: 'undefined', require: 'undefined', fetch: 'undefined', XMLHttpRequest: 'undefined', WebSocket: 'undefined', std: 'undefined', os: 'undefined' },
  );
});

test("the constructor escape that opens node:vm throws here", async () => {
  assert.deepEqual(
    await seen(`
      const tries = {};
      for (const [name, from] of [['ctx', ctx], ['function', run], ['array', []]]) {
        try { tries[name] = typeof from.constructor.constructor('return process')(); }
        catch (e) { tries[name] = e.name; }
      }
      return tries;`),
    { ctx: 'ReferenceError', function: 'ReferenceError', array: 'ReferenceError' },
  );
});

test('the global object a Function constructor reaches holds nothing of the host', async () => {
  const names = (await seen(`return Object.getOwnPropertyNames(Function('return this')()).sort()`)) as string[];
  /* THE HOST OBJECT IS AN ARGUMENT TO THE PRELUDE, NEVER A GLOBAL. The names below are what a
     careless runner would have left there. */
  for (const leaked of ['host', '__host', 'fetch', 'write', 'log', 'ctx', 'require', 'process'])
    assert.equal(names.includes(leaked), false, `${leaked} is on the global object`);
});

test('import of a module, node: or otherwise, finds nothing to load', async () => {
  assert.deepEqual(
    await seen(`
      const out = {};
      for (const spec of ['node:fs', 'fs', 'os', 'std', './x.js']) {
        try { await import(spec); out[spec] = 'loaded'; } catch (e) { out[spec] = 'refused'; }
      }
      return out;`),
    { 'node:fs': 'refused', fs: 'refused', os: 'refused', std: 'refused', './x.js': 'refused' },
  );
});

test('ctx is frozen, so a script cannot swap a door for one of its own', async () => {
  assert.deepEqual(
    await seen(`
      const before = ctx.fetch;
      try { ctx.fetch = () => 'mine'; } catch (e) {}
      try { ctx.record.list = () => 'mine'; } catch (e) {}
      return { fetch: ctx.fetch === before, frozen: Object.isFrozen(ctx) && Object.isFrozen(ctx.record) };`),
    { fetch: true, frozen: true },
  );
});

test('replacing JSON in the sandbox changes nothing the host reads', async () => {
  const h = host();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) {
      JSON.stringify = () => '{"url":"https://api.gold.example/","init":null}';
      try { await ctx.fetch('https://evil.example/'); } catch (e) {}
    }`),
    h,
  );
  /* The prelude took `JSON.stringify` before the script ran, so the forged request never forms. */
  assert.equal(h.calls, 0);
  assert.ok('refused' in a);
  assert.equal(a.refused.code, 'PULL_ORIGIN_REFUSED');
});

test('reads are opt-in: a script that declares none cannot list or get', async () => {
  const a = await runInQuickJs(decl(`export default async function run(ctx) { await ctx.record.list('obligations') }`), {
    ...host(),
    list: async () => {
      throw new Error('the host must never be asked');
    },
  });
  assert.ok('refused' in a);
  assert.equal(a.refused.code, 'FORBIDDEN');
});
