/**
 * `runInQuickJs`, held to its budgets from outside the sandbox.
 *
 * Every assertion here is one of Brief 1's red-first cases or a sibling of one. The host is a double
 * that records what reached it, because "never reaches the host function" is a claim about the
 * host's side of the boundary and can only be checked there. Nothing here opens a socket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDecl, type CtxHost, type HostRequest, type ScriptAnswer, type ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

const ORIGIN = 'https://api.gold.example';

const decl = (source: string, over: Partial<ScriptDecl> = {}): ScriptDecl => ({
  id: 'gold-rate',
  version: 1,
  egress: [ORIGIN],
  keys: ['goldapi'],
  reads: [],
  writes: ['series.gold-egp'],
  source,
  ...over,
});

/** A host double. `calls` is what actually reached the host, which is the thing under test. */
const host = (answer: (r: HostRequest) => Promise<{ status: number; headers: Record<string, string>; body: string }> = async () => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ price_gram_24k: 4321.5 }),
})): CtxHost & { calls: HostRequest[] } => {
  const calls: HostRequest[] = [];
  return {
    calls,
    fetch: (r) => {
      calls.push(r);
      return answer(r);
    },
    now: () => '2026-09-22T10:00:00Z',
    tz: 'Africa/Cairo',
    input: null,
  };
};

const refusedOf = (a: ScriptAnswer) => {
  assert.ok('refused' in a, `expected a refusal, got ${JSON.stringify(a)}`);
  assert.equal('writes' in a, false, 'a refused run carries no writes');
  return a.refused;
};

const GOLD = `
export default async function run(ctx) {
  const r = await ctx.fetch('${ORIGIN}/api/XAU/EGP', { key: 'goldapi' });
  const { price_gram_24k } = await r.json();
  ctx.log('price', price_gram_24k);
  ctx.write('series.gold-egp', { at: ctx.now(), value: Math.round(price_gram_24k * 100) });
}`;

test("section 5's own example runs: one fetch through the host, one write, the host's clock", async () => {
  const h = host();
  const a = await runInQuickJs(decl(GOLD), h);
  assert.ok('writes' in a, JSON.stringify(a));
  assert.deepEqual(a.writes, [{ op: 'create', register: 'series.gold-egp', fields: { at: '2026-09-22T10:00:00Z', value: 432150 } }]);
  assert.equal(a.log, 'price 4321.5\n');
  assert.equal(a.usage.fetches, 1);
  assert.equal(a.usage.bytes, JSON.stringify({ price_gram_24k: 4321.5 }).length);
  assert.equal(h.calls.length, 1);
  /* THE KEY CROSSES AS A LABEL. The host opens it; nothing in the sandbox ever held its bytes. */
  assert.deepEqual(h.calls[0], { url: `${ORIGIN}/api/XAU/EGP`, method: 'GET', headers: {}, body: null, key: 'goldapi' });
});

/* ── Time ─────────────────────────────────────────────────────────────────────────────────────── */

test('a script that loops forever is refused within wall_ms', async () => {
  const t = performance.now();
  const a = await runInQuickJs(decl('export default function run() { for (;;) {} }', { limits: { wall_ms: 300, cpu_ms: 1000 } }), host());
  const took = performance.now() - t;
  const r = refusedOf(a);
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.match(r.why, /wall_ms of 300/u);
  assert.ok(took < 300 + 250, `took ${Math.round(took)} ms`);
});

test('a loop at the top of the module, before any export runs, is refused the same way', async () => {
  const a = await runInQuickJs(decl('while (true) {} export default () => {}', { limits: { wall_ms: 200, cpu_ms: 1000 } }), host());
  assert.match(refusedOf(a).why, /wall_ms/u);
});

test('cpu_ms stops a busy script well before its wall_ms', async () => {
  const t = performance.now();
  const a = await runInQuickJs(decl('export default function run() { let x = 0; for (;;) x++ }', { limits: { cpu_ms: 100, wall_ms: 10_000 } }), host());
  const r = refusedOf(a);
  assert.match(r.why, /cpu_ms of 100/u);
  assert.ok(performance.now() - t < 1_000);
});

test('a fetch the host never answers is refused at wall_ms, because nothing is left to interrupt', async () => {
  const t = performance.now();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { await ctx.fetch('${ORIGIN}/slow'); }`, { limits: { wall_ms: 250 } }),
    host(() => new Promise(() => {})),
  );
  assert.match(refusedOf(a).why, /wall_ms of 250/u);
  assert.ok(performance.now() - t < 250 + 250);
});

test('waiting on the host is not CPU: a slow answer inside wall_ms is a normal run', async () => {
  const a = await runInQuickJs(
    decl(GOLD, { limits: { cpu_ms: 50, wall_ms: 5_000 } }),
    host(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { status: 200, headers: {}, body: '{"price_gram_24k":1}' };
    }),
  );
  assert.ok('writes' in a, JSON.stringify(a));
  assert.ok(a.usage.cpu_ms < 50, `cpu ${a.usage.cpu_ms}`);
  assert.ok(a.usage.wall_ms >= 150);
});

/* ── Memory ───────────────────────────────────────────────────────────────────────────────────── */

test('100 MB in one allocation is refused under the 32 MB cap', async () => {
  const a = await runInQuickJs(decl('export default function run() { return new Uint8Array(100 * 1024 * 1024).length }'), host());
  assert.match(refusedOf(a).why, /32 MB of memory/u);
});

/* THE CASE THE QUICKJS LIMIT MISSES. A hundred 1 MB pieces, each under the limit on its own, went
   to 104,956,678 bytes against a 33,554,432 limit and the run finished (see `HEAP_BYTES`). */
test('100 MB in a hundred 1 MB pieces is refused under the same cap', async () => {
  const a = await runInQuickJs(
    decl(`export default function run() {
      const kept = [];
      for (let i = 0; i < 100; i++) kept.push('x'.repeat(1024 * 1024));
      return kept.length;
    }`, { limits: { cpu_ms: 1000, wall_ms: 10_000 } }),
    host(),
  );
  assert.match(refusedOf(a).why, /32 MB of memory/u);
});

test('a run after one that ran out of memory starts clean, because each run has its own instance', async () => {
  await runInQuickJs(decl('export default function run() { const k = []; for (;;) k.push(new Array(65536).fill(1)) }', { limits: { cpu_ms: 1000 } }), host());
  const a = await runInQuickJs(decl(GOLD), host());
  assert.ok('writes' in a, JSON.stringify(a));
});

/* THE ANSWER IS WRITTEN INTO THE SANDBOX FROM A HOST CALLBACK, OUTSIDE THE RUN'S OWN try. A 40 MB
   body does not fit in 32 MB, and before the callback caught it the engine's `RuntimeError: memory
   access out of bounds` became an unhandled rejection that ended the whole Node process, host and
   every other run with it. */
test('a host answer too big for the sandbox refuses the run and leaves the host process standing', async () => {
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { const r = await ctx.fetch('${ORIGIN}/big'); ctx.write('series.gold-egp', { n: (await r.text()).length }) }`),
    host(async () => ({ status: 200, headers: {}, body: 'x'.repeat(40 * 1024 * 1024) })),
  );
  assert.match(refusedOf(a).why, /32 MB of memory/u);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

/* ── Egress ───────────────────────────────────────────────────────────────────────────────────── */

for (const [what, url] of [
  ['another origin', 'https://evil.example/steal'],
  ['the declared host over http', 'http://api.gold.example/api'],
  ['the declared origin as userinfo in front of another', `${ORIGIN}@evil.example/`],
  ['the declared host on another port', 'https://api.gold.example:8443/'],
  ['not a URL at all', 'api.gold.example/api'],
] as const)
  test(`ctx.fetch to ${what} never reaches the host function`, async () => {
    const h = host();
    const a = await runInQuickJs(
      decl(`export default async function run(ctx) {
        try { await ctx.fetch(${JSON.stringify(url)}) } catch (e) { /* swallowed on purpose */ }
        ctx.write('series.gold-egp', { value: 1 });
      }`),
      h,
    );
    assert.equal(h.calls.length, 0);
    /* STICKY: the script caught the throw and went on to write, and the run is refused anyway. */
    assert.equal(refusedOf(a).code, 'PULL_ORIGIN_REFUSED');
  });

test('a fetch past limits.fetches is refused and the extra one never leaves', async () => {
  const h = host();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { for (let i = 0; i < 3; i++) await ctx.fetch('${ORIGIN}/' + i) }`, { limits: { fetches: 2 } }),
    h,
  );
  assert.equal(h.calls.length, 2);
  assert.equal(refusedOf(a).code, 'OUT_OF_BOUNDS');
});

test('a key the declaration does not name is refused before the host sees the request', async () => {
  const h = host();
  const a = await runInQuickJs(decl(`export default async function run(ctx) { await ctx.fetch('${ORIGIN}/', { key: 'bank' }) }`), h);
  assert.equal(h.calls.length, 0);
  assert.equal(refusedOf(a).code, 'FORBIDDEN');
});

/* ── Writes ───────────────────────────────────────────────────────────────────────────────────── */

test('ctx.write over limits.writes refuses the run and returns no writes, even when the script catches it', async () => {
  const a = await runInQuickJs(
    decl(`export default function run(ctx) {
      for (let i = 0; i < 4; i++) {
        try { ctx.write('series.gold-egp', { value: i }) } catch (e) { /* swallowed on purpose */ }
      }
      return 'finished normally';
    }`, { limits: { writes: 3 } }),
    host(),
  );
  const r = refusedOf(a);
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.match(r.why, /more than its 3 writes/u);
});

test('exactly limits.writes writes is a normal run', async () => {
  const a = await runInQuickJs(
    decl(`export default function run(ctx) { for (let i = 0; i < 3; i++) ctx.write('series.gold-egp', { value: i }) }`, { limits: { writes: 3 } }),
    host(),
  );
  assert.ok('writes' in a);
  assert.equal(a.writes.length, 3);
});

test('a write to a register outside writes is FORBIDDEN', async () => {
  const a = await runInQuickJs(decl(`export default function run(ctx) { ctx.write('obligations', { amount: 1 }) }`), host());
  assert.equal(refusedOf(a).code, 'FORBIDDEN');
});

test('a script that throws its own error writes nothing and carries no code', async () => {
  const a = await runInQuickJs(
    decl(`export default function run(ctx) { ctx.write('series.gold-egp', { value: 1 }); throw new Error('provider changed shape') }`),
    host(),
  );
  const r = refusedOf(a);
  assert.equal(r.code, null);
  assert.match(r.why, /provider changed shape/u);
});

/* ── The header ───────────────────────────────────────────────────────────────────────────────── */

test('a limit over its ceiling is refused before anything runs, not clamped', async () => {
  const h = host();
  const a = await runInQuickJs(decl(GOLD, { limits: { cpu_ms: 5_000 } }), h);
  assert.equal(refusedOf(a).code, 'OUT_OF_BOUNDS');
  assert.equal(h.calls.length, 0);
});

test('an egress line that is more than a bare https origin is refused', () => {
  for (const egress of ['https://api.gold.example/v1', 'http://api.gold.example', 'api.gold.example'])
    assert.equal(checkDecl(decl(GOLD, { egress: [egress] })).hasOwnProperty('why'), true, egress);
});

test('a module with no default function is refused as a declaration, not run', async () => {
  const a = await runInQuickJs(decl('export const run = 1'), host());
  assert.equal(refusedOf(a).code, 'DECLARATION_INVALID');
});
