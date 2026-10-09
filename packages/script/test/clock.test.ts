/**
 * The sandbox's two meters read the host's clock, not the machine's (`CtxHost.clock`).
 *
 * The guard for the bands add-on's flaky run: on a loaded machine three of its tests failed at ten times their usual
 * duration, refused for time the machine spent and the script did not. Here the test holds the clock. A script is
 * refused for wall time the test moved and no real second passed, and a script under a clock that stands still is
 * never refused however long the machine takes. The machine's own clock is still what a host that names none gets,
 * and `quickjs.test.ts` holds the limits to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptAnswer, ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

const ORIGIN = 'https://api.gold.example';

const decl = (source: string, over: Partial<ScriptDecl> = {}): ScriptDecl => ({
  id: 'gold-rate',
  version: 1,
  egress: [ORIGIN],
  keys: [],
  reads: [],
  writes: ['series.gold-egp'],
  source,
  ...over,
});

/** A clock the test holds: it reads `at`, and moves by `step` on every reading. */
const held = (step = 0): { at: number; read: () => number } => {
  const c = { at: 1_000, read: () => (c.at += step) - step };
  return c;
};

const host = (clock: () => number, fetch: CtxHost['fetch'] = async () => ({ status: 200, headers: {}, body: '{}' })): CtxHost => ({
  fetch,
  now: () => '2026-10-09T09:00:00.000Z',
  tz: 'Africa/Cairo',
  input: null,
  clock,
});

const refusedOf = (a: ScriptAnswer) => {
  assert.ok('refused' in a, `expected a refusal, got ${JSON.stringify(a)}`);
  return a.refused;
};

test('a script that loops forever is refused by the clock the test holds, with no wall time spent', async () => {
  const c = held(50);
  const t0 = performance.now();
  const a = await runInQuickJs(decl('export default function run() { for (;;) {} }', { limits: { wall_ms: 900, cpu_ms: 1_000 } }), host(c.read));
  const spent = performance.now() - t0;
  const r = refusedOf(a);
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.match(r.why, /wall_ms of 900/u);
  assert.ok(a.usage.wall_ms > 900, `metered ${a.usage.wall_ms}`);
  /* The machine's clock would have spun the whole 900 ms. */
  assert.ok(spent < 450, `real time spent ${spent} ms`);
});

test('a host that moves the held clock past wall_ms has its answer refused at once', async () => {
  const c = held();
  const writes: string[] = [];
  const t0 = performance.now();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { await ctx.fetch('${ORIGIN}/slow'); ctx.write('series.gold-egp', { value: 1 }) }`, { limits: { wall_ms: 15_000 } }),
    host(c.read, async (r) => {
      writes.push(r.url);
      c.at += 20_000;
      return { status: 200, headers: {}, body: '{}' };
    }),
  );
  const spent = performance.now() - t0;
  assert.deepEqual(writes, [`${ORIGIN}/slow`]);
  assert.match(refusedOf(a).why, /wall_ms of 15000/u);
  assert.ok(a.usage.wall_ms >= 20_000, `metered ${a.usage.wall_ms}`);
  assert.ok(spent < 1_000, `real time spent ${spent} ms`);
});

test('a fetch the host never answers is refused at once when the held clock is already past wall_ms', async () => {
  const c = held();
  const t0 = performance.now();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { await ctx.fetch('${ORIGIN}/never'); }`, { limits: { wall_ms: 15_000 } }),
    host(c.read, () => {
      c.at += 15_001;
      return new Promise(() => {});
    }),
  );
  assert.match(refusedOf(a).why, /wall_ms of 15000/u);
  assert.ok(performance.now() - t0 < 1_000);
});

/* THE OTHER HALF OF THE GUARD. `quickjs.test.ts` refuses this same run at `cpu_ms: 5` on the machine's clock: two
   3 MB strings stringified take far longer than 5 ms anywhere. Under a clock that stands still the machine's time is
   none of the script's, so it is answered clean however long the machine took. */
test('a script under a clock that stands still never trips a limit, however long the machine takes', async () => {
  const c = held();
  const a = await runInQuickJs(
    decl(`export default function run(ctx) { const s = 'x'.repeat(3 * 1024 * 1024); ctx.write('series.gold-egp', { n: JSON.stringify([s, s]).length }) }`, {
      limits: { cpu_ms: 5, wall_ms: 5 },
    }),
    host(c.read),
  );
  assert.ok('writes' in a, JSON.stringify(a));
  assert.deepEqual(a.writes, [{ op: 'create', register: 'series.gold-egp', fields: { n: 6 * 1024 * 1024 + 7 } }]);
  assert.equal(a.usage.wall_ms, 0);
  assert.equal(a.usage.cpu_ms, 0);
});

test('a host that names no clock gets the machine\'s', async () => {
  const { clock: _, ...plain } = host(() => 0);
  const a = await runInQuickJs(decl('export default function run() { for (;;) {} }', { limits: { wall_ms: 200, cpu_ms: 1_000 } }), plain);
  assert.match(refusedOf(a).why, /wall_ms of 200/u);
  assert.ok(a.usage.wall_ms >= 200, `metered ${a.usage.wall_ms}`);
});
